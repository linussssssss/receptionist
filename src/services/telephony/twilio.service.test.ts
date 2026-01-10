import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const {
  mockCallsCreate,
  mockCallsFetch,
  mockRecordingsList,
  mockBalanceFetch,
  mockValidateRequest,
} = vi.hoisted(() => ({
  mockCallsCreate: vi.fn(),
  mockCallsFetch: vi.fn(),
  mockRecordingsList: vi.fn(),
  mockBalanceFetch: vi.fn(),
  mockValidateRequest: vi.fn(),
}));

vi.mock('twilio', () => {
  // Use function syntax for VoiceResponse constructor
  function VoiceResponse() {
    const elements: string[] = [];
    const gatherElements: string[] = [];
    let hasGather = false;

    return {
      say: function(options: any, text: string) {
        elements.push(`<Say voice="${options.voice}" language="${options.language}">${text}</Say>`);
      },
      play: function(url: string) {
        elements.push(`<Play>${url}</Play>`);
      },
      gather: function(_options: any) {
        hasGather = true;
        return {
          say: function(opts: any, text: string) {
            gatherElements.push(`<Say voice="${opts.voice}" language="${opts.language}">${text}</Say>`);
          },
          play: function(url: string) {
            gatherElements.push(`<Play>${url}</Play>`);
          },
        };
      },
      dial: function(number: string) {
        elements.push(`<Dial>${number}</Dial>`);
      },
      hangup: function() {
        elements.push('<Hangup/>');
      },
      toString: function() {
        let result = '<Response>';
        result += elements.join('');
        if (hasGather) {
          result += `<Gather>${gatherElements.join('')}</Gather>`;
        }
        result += '</Response>';
        return result;
      },
    };
  }

  // Main twilio function (called without 'new')
  function twilioClient() {
    return {
      calls: Object.assign(
        function(_sid: string) { return { fetch: mockCallsFetch }; },
        { create: mockCallsCreate }
      ),
      recordings: { list: mockRecordingsList },
      balance: { fetch: mockBalanceFetch },
    };
  }

  // Attach twiml and validateRequest as static properties
  (twilioClient as any).twiml = { VoiceResponse };
  (twilioClient as any).validateRequest = mockValidateRequest;

  return {
    default: twilioClient,
  };
});

vi.mock('../../config/env.js', () => ({
  env: {
    TWILIO_ACCOUNT_SID: 'test-account-sid',
    TWILIO_AUTH_TOKEN: 'test-auth-token',
    TWILIO_PHONE_NUMBER: '+1234567890',
  },
}));

import { TwilioService } from './twilio.service.js';

describe('TwilioService', () => {
  let twilioService: TwilioService;

  beforeEach(() => {
    vi.clearAllMocks();
    twilioService = new TwilioService();
  });

  describe('createGreetingResponse', () => {
    it('returns valid TwiML with Say element', () => {
      const response = twilioService.createGreetingResponse('Willkommen!');

      expect(response).toContain('<Response>');
      expect(response).toContain('</Response>');
      expect(response).toContain('Willkommen!');
    });

    it('uses German Polly voice', () => {
      const response = twilioService.createGreetingResponse('Hallo');

      expect(response).toContain('Polly.Vicki');
      expect(response).toContain('de-DE');
    });

    it('includes Gather when actionUrl provided', () => {
      const response = twilioService.createGreetingResponse('Hallo', '/webhooks/gather');

      expect(response).toContain('<Gather>');
    });

    it('does not include Gather without actionUrl', () => {
      const response = twilioService.createGreetingResponse('Hallo');

      // Without gather elements, it should just have the Say
      expect(response).not.toContain('<Gather>');
    });
  });

  describe('createGatherResponse', () => {
    it('returns TwiML with Gather containing Say', () => {
      const response = twilioService.createGatherResponse(
        'Wie kann ich Ihnen helfen?',
        '/webhooks/gather'
      );

      expect(response).toContain('<Response>');
      expect(response).toContain('<Gather>');
      expect(response).toContain('Wie kann ich Ihnen helfen?');
    });

    it('uses German language for speech recognition', () => {
      const response = twilioService.createGatherResponse('Test', '/action');

      expect(response).toContain('de-DE');
    });
  });

  describe('createGreetingResponseWithElevenLabs', () => {
    it('uses Play instead of Say', () => {
      const response = twilioService.createGreetingResponseWithElevenLabs(
        'Willkommen',
        'https://example.com',
        'client-123'
      );

      expect(response).toContain('<Play>');
    });

    it('builds correct audio URL', () => {
      const response = twilioService.createGreetingResponseWithElevenLabs(
        'Test message',
        'https://example.com',
        'client-123'
      );

      expect(response).toContain('https://example.com/audio/tts');
      expect(response).toContain('clientId=client-123');
      expect(response).toContain(encodeURIComponent('Test message'));
    });

    it('includes Gather when actionUrl provided', () => {
      const response = twilioService.createGreetingResponseWithElevenLabs(
        'Hello',
        'https://example.com',
        'client-123',
        '/webhooks/gather'
      );

      expect(response).toContain('<Gather>');
    });
  });

  describe('createGatherResponseWithElevenLabs', () => {
    it('uses Play inside Gather', () => {
      const response = twilioService.createGatherResponseWithElevenLabs(
        'Wie kann ich helfen?',
        'https://example.com',
        'client-123',
        '/webhooks/gather'
      );

      expect(response).toContain('<Gather>');
      expect(response).toContain('<Play>');
    });
  });

  describe('createSayAndHangup', () => {
    it('includes Say and Hangup', () => {
      const response = twilioService.createSayAndHangup('Auf Wiedersehen!');

      expect(response).toContain('Auf Wiedersehen!');
      expect(response).toContain('<Hangup/>');
    });

    it('uses German voice', () => {
      const response = twilioService.createSayAndHangup('Goodbye');

      expect(response).toContain('Polly.Vicki');
      expect(response).toContain('de-DE');
    });
  });

  describe('createForwardResponse', () => {
    it('includes forwarding message and Dial', () => {
      const response = twilioService.createForwardResponse('+49123456789');

      expect(response).toContain('verbinde');
      expect(response).toContain('<Dial>');
      expect(response).toContain('+49123456789');
    });
  });

  describe('createHangupResponse', () => {
    it('returns TwiML with just Hangup', () => {
      const response = twilioService.createHangupResponse();

      expect(response).toContain('<Response>');
      expect(response).toContain('<Hangup/>');
    });
  });

  describe('makeCall', () => {
    it('calls twilio API to create call', async () => {
      mockCallsCreate.mockResolvedValue({ sid: 'CA123' });

      const result = await twilioService.makeCall(
        '+49123456789',
        '+1234567890',
        'https://example.com/twiml'
      );

      expect(mockCallsCreate).toHaveBeenCalledWith({
        to: '+49123456789',
        from: '+1234567890',
        url: 'https://example.com/twiml',
      });
      expect(result.sid).toBe('CA123');
    });

    it('throws error on API failure', async () => {
      mockCallsCreate.mockRejectedValue(new Error('API Error'));

      await expect(
        twilioService.makeCall('+49123', '+1234', 'https://example.com')
      ).rejects.toThrow('Failed to make call');
    });
  });

  describe('getCall', () => {
    it('fetches call details', async () => {
      mockCallsFetch.mockResolvedValue({ status: 'completed', duration: 120 });

      const result = await twilioService.getCall('CA123');

      expect(result.status).toBe('completed');
      expect(result.duration).toBe(120);
    });

    it('throws error on fetch failure', async () => {
      mockCallsFetch.mockRejectedValue(new Error('Not found'));

      await expect(twilioService.getCall('CA123')).rejects.toThrow('Failed to fetch call');
    });
  });

  describe('getCallRecordings', () => {
    it('returns list of recordings', async () => {
      mockRecordingsList.mockResolvedValue([
        { sid: 'RE123', duration: 60 },
        { sid: 'RE456', duration: 120 },
      ]);

      const result = await twilioService.getCallRecordings('CA123');

      expect(mockRecordingsList).toHaveBeenCalledWith({ callSid: 'CA123' });
      expect(result).toHaveLength(2);
    });

    it('throws error on fetch failure', async () => {
      mockRecordingsList.mockRejectedValue(new Error('Error'));

      await expect(twilioService.getCallRecordings('CA123')).rejects.toThrow('Failed to fetch recordings');
    });
  });

  describe('validateRequest', () => {
    it('validates webhook signature', () => {
      mockValidateRequest.mockReturnValue(true);

      const isValid = twilioService.validateRequest(
        'https://example.com/webhook',
        { CallSid: 'CA123' },
        'valid-signature'
      );

      expect(isValid).toBe(true);
      expect(mockValidateRequest).toHaveBeenCalledWith(
        'test-auth-token',
        'valid-signature',
        'https://example.com/webhook',
        { CallSid: 'CA123' }
      );
    });

    it('rejects invalid signature', () => {
      mockValidateRequest.mockReturnValue(false);

      const isValid = twilioService.validateRequest(
        'https://example.com/webhook',
        { CallSid: 'CA123' },
        'invalid-signature'
      );

      expect(isValid).toBe(false);
    });
  });

  describe('getBalance', () => {
    it('returns account balance', async () => {
      mockBalanceFetch.mockResolvedValue({ balance: '100.00', currency: 'USD' });

      const result = await twilioService.getBalance();

      expect(result.balance).toBe('100.00');
      expect(result.currency).toBe('USD');
    });

    it('throws error on fetch failure', async () => {
      mockBalanceFetch.mockRejectedValue(new Error('Error'));

      await expect(twilioService.getBalance()).rejects.toThrow('Failed to fetch balance');
    });
  });
});
