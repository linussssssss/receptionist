import { vi } from 'vitest';

/**
 * Mock Claude Service
 */
export const mockClaudeService = {
  generateResponse: vi.fn().mockResolvedValue('Mocked AI response'),
  classifyIntent: vi.fn().mockResolvedValue({
    intent: 'appointment_booking',
    confidence: 0.95,
  }),
  extractAppointmentDetails: vi.fn().mockResolvedValue({
    date: '2024-01-20',
    time: '14:00',
    name: 'Test User',
    phone: '+49123456789',
  }),
};

/**
 * Mock Twilio Service
 */
export const mockTwilioService = {
  createGreetingResponse: vi.fn().mockReturnValue('<Response><Say>Hello</Say></Response>'),
  createGatherResponse: vi.fn().mockReturnValue('<Response><Gather></Gather></Response>'),
  createGatherResponseWithElevenLabs: vi.fn().mockReturnValue('<Response><Play></Play><Gather></Gather></Response>'),
  createSayAndHangup: vi.fn().mockReturnValue('<Response><Say>Goodbye</Say><Hangup/></Response>'),
  createForwardResponse: vi.fn().mockReturnValue('<Response><Dial></Dial></Response>'),
  makeCall: vi.fn().mockResolvedValue({ sid: 'call-sid-123' }),
  getCall: vi.fn().mockResolvedValue({ status: 'completed', duration: 120 }),
  validateRequest: vi.fn().mockReturnValue(true),
  getBalance: vi.fn().mockResolvedValue({ balance: '100.00', currency: 'USD' }),
};

/**
 * Mock ElevenLabs Service
 */
export const mockElevenLabsService = {
  textToSpeech: vi.fn().mockResolvedValue(Buffer.from('mock-audio-data')),
  textToSpeechStream: vi.fn().mockResolvedValue(new ReadableStream()),
  getVoices: vi.fn().mockResolvedValue([{ voice_id: 'voice-1', name: 'Test Voice' }]),
};

/**
 * Mock Email Service
 */
export const mockEmailService = {
  sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-123' }),
  sendAppointmentReminder: vi.fn().mockResolvedValue({ success: true }),
  sendAppointmentConfirmation: vi.fn().mockResolvedValue({ success: true }),
};

/**
 * Mock Alert Service
 */
export const mockAlertService = {
  sendCriticalAlert: vi.fn().mockResolvedValue(undefined),
  sendWarningAlert: vi.fn().mockResolvedValue(undefined),
  recordMetric: vi.fn().mockResolvedValue(undefined),
  getStats: vi.fn().mockReturnValue({
    enabled: true,
    detailLevel: 'basic',
    deduplication: { alertsInWindow: 0, hourlyCount: 0 },
  }),
};

/**
 * Mock Google Calendar Service
 */
export const mockGoogleCalendarService = {
  createEvent: vi.fn().mockResolvedValue({ id: 'event-123' }),
  updateEvent: vi.fn().mockResolvedValue({ id: 'event-123' }),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  getEvent: vi.fn().mockResolvedValue({ id: 'event-123', summary: 'Test Event' }),
  listEvents: vi.fn().mockResolvedValue([]),
  listEventsDelta: vi.fn().mockResolvedValue({ events: [], nextSyncToken: 'token-123' }),
  watchCalendar: vi.fn().mockResolvedValue({ id: 'channel-123', expiration: Date.now() + 86400000 }),
  stopWatching: vi.fn().mockResolvedValue(undefined),
  convertAppointmentToCalendarEvent: vi.fn().mockReturnValue({
    summary: 'Appointment',
    start: { dateTime: '2024-01-20T14:00:00+01:00' },
    end: { dateTime: '2024-01-20T14:30:00+01:00' },
  }),
  convertCalendarEventToAppointment: vi.fn().mockReturnValue({
    customerName: 'Test User',
    customerPhone: '+49123456789',
    datetime: new Date('2024-01-20T14:00:00'),
    durationMinutes: 30,
  }),
};

/**
 * Mock Calendar Sync Service
 */
export const mockCalendarSyncService = {
  syncAppointmentToCalendar: vi.fn().mockResolvedValue(undefined),
  syncCalendarEventToAppointment: vi.fn().mockResolvedValue(undefined),
  retryFailedSyncs: vi.fn().mockResolvedValue(undefined),
};

/**
 * Helper to setup all service mocks
 */
export const setupServiceMocks = () => {
  vi.mock('../../src/services/ai/claude.service.js', () => ({
    claudeService: mockClaudeService,
  }));

  vi.mock('../../src/services/telephony/twilio.service.js', () => ({
    twilioService: mockTwilioService,
  }));

  vi.mock('../../src/services/ai/elevenlabs.service.js', () => ({
    elevenLabsService: mockElevenLabsService,
  }));

  vi.mock('../../src/services/notifications/email.service.js', () => ({
    emailService: mockEmailService,
  }));

  vi.mock('../../src/services/monitoring/alert.service.js', () => ({
    alertService: mockAlertService,
    AlertType: {
      CLAUDE_API_FAILURE: 'claude_api_failure',
      APPOINTMENT_CREATION_FAILED: 'appointment_creation_failed',
      DATABASE_ERROR: 'database_error',
      TTS_FAILURE: 'tts_failure',
    },
    MetricType: {
      OPERATION_SUCCESS: 'operation_success',
      OPERATION_FAILURE: 'operation_failure',
    },
  }));

  vi.mock('../../src/services/integrations/google-calendar.service.js', () => ({
    googleCalendarService: mockGoogleCalendarService,
  }));

  vi.mock('../../src/services/integrations/calendar-sync.service.js', () => ({
    calendarSyncService: mockCalendarSyncService,
  }));
};

/**
 * Reset all service mocks
 */
export const resetServiceMocks = () => {
  Object.values(mockClaudeService).forEach((fn) => fn.mockClear());
  Object.values(mockTwilioService).forEach((fn) => fn.mockClear());
  Object.values(mockElevenLabsService).forEach((fn) => fn.mockClear());
  Object.values(mockEmailService).forEach((fn) => fn.mockClear());
  Object.values(mockAlertService).forEach((fn) => fn.mockClear());
  Object.values(mockGoogleCalendarService).forEach((fn) => fn.mockClear());
  Object.values(mockCalendarSyncService).forEach((fn) => fn.mockClear());
};
