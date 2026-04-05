import { claudeService } from '../ai/claude.service.js';

interface AppointmentData {
  date?: string;
  time?: string;
  name?: string;
  phone?: string;
}

/**
 * Incremental Appointment Extractor
 * 
 * Instead of extracting from full conversation history (which causes drift),
 * we extract from ONLY the current user message and merge with existing data.
 */
export class IncrementalAppointmentExtractor {
  /**
   * Extract appointment fields from a SINGLE user message
   * This prevents Claude from drifting into conversation mode
   */
  async extractFromSingleMessage(
    userMessage: string,
    existingData: AppointmentData = {}
  ): Promise<AppointmentData> {
    // Create a minimal conversation for extraction
    // We tell Claude what we already have, and ask it to extract any NEW info
    const conversation = [
      {
        role: 'assistant' as const,
        content: this.buildPromptForExtraction(existingData),
      },
      {
        role: 'user' as const,
        content: userMessage,
      },
    ];

    // Extract from just these 2 messages
    const extracted = await claudeService.extractAppointmentDetails(conversation, 2);

    // Merge with existing data (new data overwrites old)
    return {
      ...existingData,
      ...extracted,
    };
  }

  /**
   * Build a prompt that extracts ONLY new data from the current message
   * We handle merging in JavaScript, so Claude doesn't need to track state
   */
  private buildPromptForExtraction(existingData: AppointmentData): string {
    const missing = this.getMissingFields(existingData);

    // Get current date for context with weekday
    const now = new Date();
    const currentDateStr = now.toISOString().split('T')[0];
    const weekdayName = now.toLocaleDateString('de-DE', { weekday: 'long' });

    if (missing.length === 0) {
      return `Heute ist ${weekdayName}, der ${currentDateStr}. Extrahiere alle Termininformationen aus der nächsten Nachricht: Datum (YYYY-MM-DD), Uhrzeit, Name, Telefonnummer. WICHTIG: Wenn der Nutzer den Wochentag "${weekdayName}" nennt, meint er HEUTE (${currentDateStr}).`;
    }

    const fieldNames: Record<string, string> = {
      date: `Datum (im Format YYYY-MM-DD, heute ist ${weekdayName}, der ${currentDateStr}. WICHTIG: Wenn der Nutzer "${weekdayName}" sagt, verwende ${currentDateStr}. Wenn ein Wochentag in der Zukunft genannt wird, berechne das nächste Datum dieses Wochentags)`,
      time: 'Uhrzeit (im Format HH:MM)',
      name: 'Name der Person (auch bei Satzzeichen wie "Max," oder "Max." nur den Namen extrahieren)',
      phone: 'Telefonnummer (alle Ziffern zusammen, ohne Leerzeichen)',
    };

    const nextField = missing[0];

    return `Extrahiere ${fieldNames[nextField]} aus der nächsten Nachricht. Falls Ziffern einzeln genannt werden (z.B. "1 1 4 4 1"), schreibe sie zusammen als eine Telefonnummer "11441".`;
  }

  /**
   * Check if we have all required fields
   */
  hasAllFields(data: AppointmentData): boolean {
    return !!(data.date && data.time && data.name && data.phone);
  }

  /**
   * Get list of missing fields
   */
  getMissingFields(data: AppointmentData): string[] {
    const missing: string[] = [];
    if (!data.date) missing.push('date');
    if (!data.time) missing.push('time');
    if (!data.name) missing.push('name');
    if (!data.phone) missing.push('phone');
    return missing;
  }

  /**
   * Generate a prompt to ask for the next missing field
   */
  generatePromptForNextField(data: AppointmentData): string {
    const missing = this.getMissingFields(data);

    if (missing.length === 0) {
      return 'Perfekt! Ich habe alle Informationen.';
    }

    // Ask for the first missing field
    const prompts: Record<string, string> = {
      date: 'An welchem Tag möchten Sie den Termin?',
      time: 'Zu welcher Uhrzeit passt es Ihnen am besten?',
      name: 'Wie ist Ihr Name, bitte?',
      phone: 'Unter welcher Telefonnummer können wir Sie erreichen?',
    };

    return prompts[missing[0]] || 'Können Sie mir weitere Details geben?';
  }
}

export const incrementalExtractor = new IncrementalAppointmentExtractor();