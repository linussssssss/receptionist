import twilio from 'twilio';
import { env } from '../../config/env.js';

const VoiceResponse = twilio.twiml.VoiceResponse;

export class TwilioService {
  private client: twilio.Twilio;

  constructor() {
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  /**
   * Create TwiML response to greet caller
   */
  createGreetingResponse(greeting: string, actionUrl?: string): string {
    const response = new VoiceResponse();
    
    response.say(
      {
        voice: 'Polly.Vicki', // German female voice
        language: 'de-DE',
      },
      greeting
    );

    // If actionUrl provided, gather speech input
    if (actionUrl) {
      response.gather({
        input: ['speech'],
        language: 'de-DE',
        action: actionUrl,
        speechTimeout: 'auto',
        timeout: 5,
      });
    }

    return response.toString();
  }

  /**
   * Create TwiML response to play message and gather input
   */
  createGatherResponse(message: string, actionUrl: string): string {
    const response = new VoiceResponse();
    
    const gather = response.gather({
      input: ['speech'],
      language: 'de-DE',
      action: actionUrl,
      speechTimeout: 'auto',
      timeout: 5,
    });

    gather.say(
      {
        voice: 'Polly.Vicki',
        language: 'de-DE',
      },
      message
    );

    return response.toString();
  }

  /**
   * Create TwiML to say something and hang up
   */
  createSayAndHangup(message: string): string {
    const response = new VoiceResponse();
    
    response.say(
      {
        voice: 'Polly.Vicki',
        language: 'de-DE',
      },
      message
    );
    
    response.hangup();
    
    return response.toString();
  }

  /**
   * Forward call to another number
   */
  createForwardResponse(targetNumber: string): string {
    const response = new VoiceResponse();
    
    response.say(
      {
        voice: 'Polly.Vicki',
        language: 'de-DE',
      },
      'Ich verbinde Sie. Einen Moment bitte.'
    );
    
    response.dial(targetNumber);
    
    return response.toString();
  }

  /**
   * Hangup the call
   */
  createHangupResponse(): string {
    const response = new VoiceResponse();
    response.hangup();
    return response.toString();
  }

  /**
   * Make outbound call
   */
  async makeCall(to: string, from: string, url: string) {
    try {
      const call = await this.client.calls.create({
        to,
        from,
        url,
      });
      
      return call;
    } catch (err) {
      throw new Error(`Failed to make call: ${err}`);
    }
  }

  /**
   * Get call details
   */
  async getCall(callSid: string) {
    try {
      return await this.client.calls(callSid).fetch();
    } catch (err) {
      throw new Error(`Failed to fetch call: ${err}`);
    }
  }

  /**
   * Get call recordings
   */
  async getCallRecordings(callSid: string) {
    try {
      return await this.client.recordings.list({ callSid });
    } catch (err) {
      throw new Error(`Failed to fetch recordings: ${err}`);
    }
  }

  /**
   * Validate webhook signature (security)
   */
  validateRequest(url: string, params: Record<string, any>, signature: string): boolean {
    return twilio.validateRequest(
      env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      params
    );
  }

  /**
   * Get account balance
   */
  async getBalance() {
    try {
      const account = await this.client.balance.fetch();
      return account;
    } catch (err) {
      throw new Error(`Failed to fetch balance: ${err}`);
    }
  }
}

export const twilioService = new TwilioService();