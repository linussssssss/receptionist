import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppointmentHandler } from './appointment.handler.js';

// Mock dependencies
vi.mock('../ai/claude.service.js', () => ({
  claudeService: {
    extractAppointmentDetails: vi.fn(),
  },
}));

vi.mock('../../server.js', () => ({
  prisma: {
    appointment: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../notifications/email.service.js', () => ({
  emailService: {
    sendAppointmentConfirmation: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../monitoring/monitored-operation.js', () => ({
  monitoredOperation: vi.fn((_name, fn, _context) => fn()),
}));

describe('AppointmentHandler', () => {
  let handler: AppointmentHandler;

  beforeEach(() => {
    handler = new AppointmentHandler();
    vi.clearAllMocks();
  });

  describe('hasRequiredFields', () => {
    it('returns true when all fields are present', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      expect(handler.hasRequiredFields(data)).toBe(true);
    });

    it('returns false when date is missing', () => {
      const data = {
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      expect(handler.hasRequiredFields(data)).toBe(false);
    });

    it('returns false when time is missing', () => {
      const data = {
        date: '2024-01-20',
        name: 'John Doe',
        phone: '+49123456789',
      };

      expect(handler.hasRequiredFields(data)).toBe(false);
    });

    it('returns false when name is missing', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        phone: '+49123456789',
      };

      expect(handler.hasRequiredFields(data)).toBe(false);
    });

    it('returns false when phone is missing', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        name: 'John Doe',
      };

      expect(handler.hasRequiredFields(data)).toBe(false);
    });

    it('returns false when field is empty string', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        name: '',
        phone: '+49123456789',
      };

      expect(handler.hasRequiredFields(data)).toBe(false);
    });

    it('returns false when field is null', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        name: null as any,
        phone: '+49123456789',
      };

      expect(handler.hasRequiredFields(data)).toBe(false);
    });
  });

  describe('getMissingFields', () => {
    it('returns empty array when all fields present', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      expect(handler.getMissingFields(data)).toEqual([]);
    });

    it('returns array with missing field names', () => {
      const data = {
        date: '2024-01-20',
        name: 'John Doe',
      };

      const missing = handler.getMissingFields(data);
      expect(missing).toContain('time');
      expect(missing).toContain('phone');
      expect(missing).not.toContain('date');
      expect(missing).not.toContain('name');
    });

    it('returns all fields when data is empty', () => {
      const data = {};

      const missing = handler.getMissingFields(data);
      expect(missing).toHaveLength(4);
      expect(missing).toContain('date');
      expect(missing).toContain('time');
      expect(missing).toContain('name');
      expect(missing).toContain('phone');
    });
  });

  describe('generateCollectionPrompt', () => {
    it('returns date prompt when date is missing', () => {
      const prompt = handler.generateCollectionPrompt(['date']);
      expect(prompt).toContain('Tag');
      expect(prompt).toContain('Datum');
    });

    it('returns time prompt when time is missing', () => {
      const prompt = handler.generateCollectionPrompt(['time']);
      expect(prompt).toContain('Uhrzeit');
    });

    it('returns name prompt when name is missing', () => {
      const prompt = handler.generateCollectionPrompt(['name']);
      expect(prompt).toContain('Name');
    });

    it('returns phone prompt when phone is missing', () => {
      const prompt = handler.generateCollectionPrompt(['phone']);
      expect(prompt).toContain('Telefonnummer');
    });

    it('returns first missing field prompt when multiple missing', () => {
      const prompt = handler.generateCollectionPrompt(['time', 'phone']);
      // Should return prompt for first missing field (time)
      expect(prompt).toContain('Uhrzeit');
    });

    it('returns completion message when no fields missing', () => {
      const prompt = handler.generateCollectionPrompt([]);
      expect(prompt).toContain('Perfekt');
    });
  });

  describe('validateData', () => {
    it('returns valid for correct data', () => {
      // Use a future date
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const dateStr = futureDate.toISOString().split('T')[0];

      const data = {
        date: dateStr,
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      const result = handler.validateData(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for invalid date format', () => {
      const data = {
        date: '20-01-2024', // Wrong format
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      const result = handler.validateData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid date format');
    });

    it('returns error for invalid time format', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const data = {
        date: futureDate.toISOString().split('T')[0],
        time: '2:00 PM', // Wrong format
        name: 'John Doe',
        phone: '+49123456789',
      };

      const result = handler.validateData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid time format');
    });

    it('returns error for past date', () => {
      const data = {
        date: '2020-01-01', // Past date
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      const result = handler.validateData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Date cannot be in the past');
    });

    it('accepts today as valid date', () => {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];

      const data = {
        date: dateStr,
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      const result = handler.validateData(data);
      // Today should be valid (not in the past)
      expect(result.errors).not.toContain('Date cannot be in the past');
    });
  });

  describe('generateConfirmation', () => {
    it('generates German confirmation message', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      const confirmation = handler.generateConfirmation(data);

      expect(confirmation).toContain('John Doe');
      expect(confirmation).toContain('14:00');
      expect(confirmation).toContain('+49123456789');
      expect(confirmation).toContain('Termin');
    });

    it('includes formatted date in German', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      const confirmation = handler.generateConfirmation(data);

      // Should contain German formatted date (e.g., "Samstag, 20. Januar 2024")
      expect(confirmation).toContain('2024');
      expect(confirmation).toContain('Januar');
    });
  });
});
