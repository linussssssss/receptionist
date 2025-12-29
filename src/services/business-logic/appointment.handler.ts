import { claudeService } from '../ai/claude.service.js';
import { prisma } from '../../server.js';

export interface AppointmentData {
  date?: string;
  time?: string;
  name?: string;
  phone?: string;
  email?: string;
  reason?: string;
}

export class AppointmentHandler {
  /**
   * Extract appointment details from conversation
   */
  async extractDetails(
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<AppointmentData> {
    return await claudeService.extractAppointmentDetails(conversationHistory);
  }

  /**
   * Check if all required fields are collected
   */
  hasRequiredFields(data: AppointmentData): boolean {
    return !!(data.date && data.time && data.name && data.phone);
  }

  /**
   * Get missing fields for appointment
   */
  getMissingFields(data: AppointmentData): string[] {
    const required = ['date', 'time', 'name', 'phone'];
    return required.filter((field) => !data[field as keyof AppointmentData]);
  }

  /**
   * Generate prompt to collect missing information
   */
  generateCollectionPrompt(missingFields: string[]): string {
    const fieldNames: Record<string, string> = {
      date: 'Datum',
      time: 'Uhrzeit',
      name: 'Name',
      phone: 'Telefonnummer',
      reason: 'Grund für den Termin',
    };

    if (missingFields.length === 1) {
      return `Können Sie mir bitte noch ${fieldNames[missingFields[0]]} nennen?`;
    }

    const fields = missingFields.map((f) => fieldNames[f]).join(', ');
    return `Ich benötige noch folgende Informationen: ${fields}`;
  }

  /**
   * Create appointment in database
   */
  async createAppointment(
    callId: string | null | undefined,
    clientId: string,
    data: AppointmentData
  ): Promise<any> {
    if (!this.hasRequiredFields(data)) {
      throw new Error('Missing required appointment fields');
    }

    // Parse datetime
    const datetime = new Date(`${data.date}T${data.time}:00`);

    return await prisma.appointment.create({
      data: {
        callId: callId || undefined,
        clientId,
        customerName: data.name!,
        customerPhone: data.phone!,
        customerEmail: data.email,
        datetime,
        reason: data.reason,
        status: 'PENDING',
      },
    });
  }

  /**
   * Check if requested time slot is available
   */
  async isSlotAvailable(
    clientId: string,
    datetime: Date,
    durationMinutes: number = 30
  ): Promise<boolean> {
    const endTime = new Date(datetime.getTime() + durationMinutes * 60000);

    const conflicting = await prisma.appointment.findFirst({
      where: {
        clientId,
        status: {
          in: ['PENDING', 'CONFIRMED'],
        },
        OR: [
          {
            datetime: {
              gte: datetime,
              lt: endTime,
            },
          },
          {
            AND: [
              {
                datetime: {
                  lte: datetime,
                },
              },
              // Assuming 30min appointments by default
            ],
          },
        ],
      },
    });

    return !conflicting;
  }

  /**
   * Generate confirmation message
   */
  generateConfirmation(data: AppointmentData): string {
    return `Perfekt! Ihr Termin ist gebucht für ${data.date} um ${data.time} Uhr. 
Wir haben Ihre Daten gespeichert: ${data.name}, ${data.phone}.
${data.reason ? `Grund: ${data.reason}.` : ''}
Sie erhalten eine Bestätigung per SMS. Haben Sie noch weitere Fragen?`;
  }
}

export const appointmentHandler = new AppointmentHandler();