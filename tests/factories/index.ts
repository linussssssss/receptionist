import type { User, Client, Appointment, Call, Session } from '@prisma/client';

/**
 * Factory for creating test User objects
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-test-123',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: '$2b$04$test-hash',
    role: 'ADMIN',
    clientId: 'client-test-123',
    isActive: true,
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Factory for creating test Client objects
 */
export function createMockClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-test-123',
    name: 'Test Business',
    phoneNumber: '+49123456789',
    greetingMessage: 'Willkommen bei Test Business',
    llmSystemPrompt: 'You are a helpful receptionist for Test Business.',
    businessHours: {
      monday: { open: '09:00', close: '17:00' },
      tuesday: { open: '09:00', close: '17:00' },
      wednesday: { open: '09:00', close: '17:00' },
      thursday: { open: '09:00', close: '17:00' },
      friday: { open: '09:00', close: '17:00' },
    },
    escalationRules: {},
    integrations: {},
    voiceId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Factory for creating test Appointment objects
 */
export function createMockAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-test-123',
    clientId: 'client-test-123',
    callId: 'call-test-123',
    customerName: 'John Doe',
    customerPhone: '+49987654321',
    customerEmail: 'john@example.com',
    datetime: new Date('2024-01-20T14:00:00'),
    durationMinutes: 30,
    reason: 'Consultation',
    notes: 'Test appointment',
    status: 'PENDING',
    calendarId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Factory for creating test Call objects
 */
export function createMockCall(overrides: Partial<Call> = {}): Call {
  return {
    id: 'call-test-123',
    clientId: 'client-test-123',
    callSid: 'CA1234567890',
    callerNumber: '+49111222333',
    status: 'COMPLETED',
    intent: 'appointment_booking',
    startTime: new Date(),
    endTime: new Date(),
    duration: 120,
    transcript: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Factory for creating test Session objects
 */
export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-test-123',
    userId: 'user-test-123',
    token: 'test-session-token',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Factory for creating appointment data (pre-database format)
 */
export function createAppointmentData(overrides: Record<string, unknown> = {}) {
  return {
    date: '2024-01-20',
    time: '14:00',
    name: 'John Doe',
    phone: '+49987654321',
    ...overrides,
  };
}

/**
 * Factory for creating conversation history
 */
export function createConversationHistory(messages: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
  return messages.length > 0
    ? messages
    : [
        { role: 'assistant' as const, content: 'Willkommen! Wie kann ich Ihnen helfen?' },
        { role: 'user' as const, content: 'Ich möchte einen Termin buchen' },
      ];
}
