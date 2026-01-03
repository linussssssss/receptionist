// appointment.handler.ts - FIXED VERSION
import { claudeService } from '../ai/claude.service.js';
import { prisma } from '../../server.js';

interface AppointmentData {
  date?: string;      // ISO date (YYYY-MM-DD)
  time?: string;      // Time (HH:MM)
  name?: string;      // Customer name
  phone?: string;     // Phone number
  // NOTE: We deliberately DO NOT include 'reason' - it's not in our schema
}

// Define ONLY the fields we actually need and have in the database
const REQUIRED_FIELDS = ['date', 'time', 'name', 'phone'] as const;

export class AppointmentHandler {
  /**
   * Extract appointment details from conversation history
   * @param conversationHistory - Array of conversation messages
   * @param maxMessages - Optional limit on how many messages to analyze
   */
  async extractDetails(
    conversationHistory: Array<{ role: string; content: string }>,
    maxMessages?: number
  ): Promise<AppointmentData> {
    // Cast to the correct type expected by claudeService
    const messages = conversationHistory.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
    
    return await claudeService.extractAppointmentDetails(messages, maxMessages);
  }

  /**
   * Check if we have all required fields
   */
  hasRequiredFields(data: AppointmentData): boolean {
    return REQUIRED_FIELDS.every(field => {
      const value = data[field];
      return value !== undefined && value !== null && value !== '';
    });
  }

  /**
   * Get list of missing fields
   */
  getMissingFields(data: AppointmentData): string[] {
    return REQUIRED_FIELDS.filter(field => {
      const value = data[field];
      return value === undefined || value === null || value === '';
    });
  }

  /**
   * Generate prompt to collect missing information
   * IMPORTANT: Only ask for fields we actually need
   */
  generateCollectionPrompt(missingFields: string[]): string {
    const fieldPrompts: Record<string, string> = {
      date: 'An welchem Tag möchten Sie den Termin? Bitte nennen Sie mir das Datum.',
      time: 'Zu welcher Uhrzeit passt es Ihnen am besten?',
      name: 'Wie ist Ihr Name, bitte?',
      phone: 'Unter welcher Telefonnummer können wir Sie erreichen?',
    };

    // Get prompts for missing fields only
    const prompts = missingFields
      .filter(field => field in fieldPrompts)
      .map(field => fieldPrompts[field]);

    if (prompts.length === 0) {
      return 'Perfekt! Ich habe alle Informationen.';
    }

    if (prompts.length === 1) {
      return prompts[0];
    }

    // Multiple missing fields - ask for the first one
    return prompts[0];
  }

  /**
   * Create appointment in database
   */
  async createAppointment(
    callId: string,
    clientId: string,
    data: AppointmentData
  ): Promise<any> {
    if (!this.hasRequiredFields(data)) {
      throw new Error('Missing required fields for appointment creation');
    }

    // Combine date and time into ISO timestamp
    const scheduledTime = new Date(`${data.date}T${data.time}:00.000Z`);

    return await prisma.appointment.create({
      data: {
        callId,
        clientId,
        customerName: data.name!,
        customerPhone: data.phone!,
        datetime: scheduledTime,
        status: 'CONFIRMED',
        notes: 'Über Telefon vereinbart',
      },
    });
  }

  /**
   * Generate confirmation message
   */
  generateConfirmation(data: AppointmentData): string {
    const dateObj = new Date(data.date!);
    const dateStr = dateObj.toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `Perfekt! Ich habe einen Termin für ${data.name} am ${dateStr} um ${data.time} Uhr eingetragen. Wir werden Sie unter der Nummer ${data.phone} kontaktieren, falls es Änderungen gibt.`;
  }

  /**
   * Validate appointment data quality
   */
  validateData(data: AppointmentData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate date format
    if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      errors.push('Invalid date format');
    }

    // Validate time format
    if (data.time && !/^\d{2}:\d{2}$/.test(data.time)) {
      errors.push('Invalid time format');
    }

    // Validate date is in the future
    if (data.date) {
      const appointmentDate = new Date(data.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (appointmentDate < today) {
        errors.push('Date cannot be in the past');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const appointmentHandler = new AppointmentHandler();