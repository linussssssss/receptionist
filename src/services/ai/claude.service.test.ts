import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

// Mock Anthropic SDK - use function syntax for constructor
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: function MockAnthropic() {
      return {
        messages: {
          create: mockCreate,
        },
      };
    },
  };
});

// Mock monitoring
vi.mock('../monitoring/monitored-operation.js', () => ({
  monitoredOperation: vi.fn((_name, fn, _context) => fn()),
}));

vi.mock('../monitoring/alert.service.js', () => ({
  alertService: {
    recordMetric: vi.fn().mockResolvedValue(undefined),
  },
  AlertType: {},
  MetricType: {
    OPERATION_FAILURE: 'operation_failure',
  },
}));

vi.mock('../../config/sentry.js', () => ({
  captureError: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-api-key',
  },
}));

import { ClaudeService } from './claude.service.js';

describe('ClaudeService', () => {
  let claudeService: ClaudeService;

  beforeEach(() => {
    vi.clearAllMocks();
    claudeService = new ClaudeService();
  });

  describe('generateResponse', () => {
    it('returns AI response for conversation', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello! How can I help you?' }],
      });

      const result = await claudeService.generateResponse(
        'You are a helpful assistant',
        [{ role: 'user', content: 'Hello' }],
        'What services do you offer?'
      );

      expect(result.response).toBe('Hello! How can I help you?');
    });

    it('builds messages array correctly', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
      });

      await claudeService.generateResponse(
        'System prompt',
        [
          { role: 'assistant', content: 'Welcome!' },
          { role: 'user', content: 'Hi' },
        ],
        'New message'
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'assistant', content: 'Welcome!' },
            { role: 'user', content: 'Hi' },
            { role: 'user', content: 'New message' },
          ],
        })
      );
    });

    it('uses correct model', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
      });

      await claudeService.generateResponse('prompt', [], 'message');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-5',
        })
      );
    });

    it('handles non-text response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'tool_use', id: 'tool-1' }],
      });

      const result = await claudeService.generateResponse('prompt', [], 'message');

      expect(result.response).toBe('');
    });
  });

  describe('classifyIntent', () => {
    it('classifies appointment_booking intent', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"intent": "appointment_booking", "confidence": 0.95}' }],
      });

      const result = await claudeService.classifyIntent(
        'Ich möchte einen Termin buchen',
        []
      );

      expect(result.intent).toBe('appointment_booking');
      expect(result.confidence).toBe(0.95);
    });

    it('classifies emergency intent', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"intent": "emergency", "confidence": 0.98}' }],
      });

      const result = await claudeService.classifyIntent(
        'Ich habe starke Schmerzen!',
        []
      );

      expect(result.intent).toBe('emergency');
    });

    it('classifies information_request intent', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"intent": "information_request", "confidence": 0.9, "data": {"topic": "hours"}}' }],
      });

      const result = await claudeService.classifyIntent(
        'Wann haben Sie geöffnet?',
        []
      );

      expect(result.intent).toBe('information_request');
      expect(result.data?.topic).toBe('hours');
    });

    it('handles markdown code blocks in response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n{"intent": "appointment_booking", "confidence": 0.95}\n```' }],
      });

      const result = await claudeService.classifyIntent('Termin bitte', []);

      expect(result.intent).toBe('appointment_booking');
    });

    it('extracts JSON from mixed content', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Here is the result: {"intent": "other", "confidence": 0.8} based on analysis' }],
      });

      const result = await claudeService.classifyIntent('Something else', []);

      expect(result.intent).toBe('other');
    });

    it('falls back to other intent on parse failure', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'This is not JSON at all' }],
      });

      const result = await claudeService.classifyIntent('Test message', []);

      expect(result.intent).toBe('other');
      expect(result.confidence).toBe(0.8);
    });

    it('falls back to other on API error', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));

      const result = await claudeService.classifyIntent('Test message', []);

      expect(result.intent).toBe('other');
      expect(result.confidence).toBe(0.8);
    });

    it('uses only last 3 messages for context', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"intent": "other", "confidence": 0.8}' }],
      });

      const history = [
        { role: 'user' as const, content: 'Message 1' },
        { role: 'assistant' as const, content: 'Response 1' },
        { role: 'user' as const, content: 'Message 2' },
        { role: 'assistant' as const, content: 'Response 2' },
        { role: 'user' as const, content: 'Message 3' },
        { role: 'assistant' as const, content: 'Response 3' },
      ];

      await claudeService.classifyIntent('New message', history);

      // Should include last 3 history messages + new message = 4 total
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ content: 'Response 2' }),
            expect.objectContaining({ content: 'Message 3' }),
            expect.objectContaining({ content: 'Response 3' }),
            expect.objectContaining({ content: 'New message' }),
          ]),
        })
      );
    });
  });

  describe('extractAppointmentDetails', () => {
    it('extracts all appointment fields', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"date": "2024-02-03", "time": "14:00", "name": "Max", "phone": "123456789"}' }],
      });

      const result = await claudeService.extractAppointmentDetails([
        { role: 'user', content: 'I need an appointment on Feb 3rd at 2pm. Name is Max, phone 123456789' },
      ]);

      expect(result.date).toBe('2024-02-03');
      expect(result.time).toBe('14:00');
      expect(result.name).toBe('Max');
      expect(result.phone).toBe('123456789');
    });

    it('extracts partial data when not all fields provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"date": "2024-02-03", "time": "14:00"}' }],
      });

      const result = await claudeService.extractAppointmentDetails([
        { role: 'user', content: 'Feb 3rd at 2pm' },
      ]);

      expect(result.date).toBe('2024-02-03');
      expect(result.time).toBe('14:00');
      expect(result.name).toBeUndefined();
      expect(result.phone).toBeUndefined();
    });

    it('returns empty object when no data found', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
      });

      const result = await claudeService.extractAppointmentDetails([
        { role: 'user', content: 'Hello' },
      ]);

      expect(result).toEqual({});
    });

    it('filters out non-allowed fields', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"date": "2024-02-03", "name": "Max", "extra_field": "should be filtered", "reason": "also filtered"}' }],
      });

      const result = await claudeService.extractAppointmentDetails([
        { role: 'user', content: 'Feb 3rd, Max here' },
      ]);

      expect(result.date).toBe('2024-02-03');
      expect(result.name).toBe('Max');
      expect(result.extra_field).toBeUndefined();
      expect(result.reason).toBeUndefined();
    });

    it('handles markdown code blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n{"date": "2024-02-03"}\n```' }],
      });

      const result = await claudeService.extractAppointmentDetails([
        { role: 'user', content: 'Feb 3rd' },
      ]);

      expect(result.date).toBe('2024-02-03');
    });

    it('returns empty object on API error', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));

      const result = await claudeService.extractAppointmentDetails([
        { role: 'user', content: 'Test' },
      ]);

      expect(result).toEqual({});
    });

    it('respects maxMessages parameter', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
      });

      const history = [
        { role: 'user' as const, content: 'Message 1' },
        { role: 'assistant' as const, content: 'Response 1' },
        { role: 'user' as const, content: 'Message 2' },
        { role: 'assistant' as const, content: 'Response 2' },
        { role: 'user' as const, content: 'Message 3' },
      ];

      await claudeService.extractAppointmentDetails(history, 2);

      // Should only include last 2 messages
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'assistant', content: 'Response 2' },
            { role: 'user', content: 'Message 3' },
          ],
        })
      );
    });

    it('uses last 10 messages by default', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
      });

      // Create 15 messages
      const history = Array.from({ length: 15 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `Message ${i}`,
      }));

      await claudeService.extractAppointmentDetails(history);

      // Should include last 10 messages
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ content: 'Message 14' }),
          ]),
        })
      );
    });
  });
});
