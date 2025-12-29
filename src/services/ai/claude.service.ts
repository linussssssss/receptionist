import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  response: string;
  intent?: string;
  data?: Record<string, any>;
}

export class ClaudeService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate response based on conversation history
   */
  async generateResponse(
    systemPrompt: string,
    conversationHistory: ConversationMessage[],
    currentUserMessage: string
  ): Promise<ClaudeResponse> {
    try {
      const messages: Anthropic.MessageParam[] = [
        ...conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: currentUserMessage,
        },
      ];

      console.log('Calling Claude API with messages:', messages.length);

      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5', // Faster model
        max_tokens: 512, // Reduced for faster responses
        system: systemPrompt,
        messages,
      });

      console.log('Claude API response received');

      const responseText = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';

      return {
        response: responseText,
      };
    } catch (err: any) {
      console.error('Claude API error details:', {
        message: err.message,
        status: err.status,
        error: err.error,
      });
      throw new Error(`Claude API error: ${err.message || err}`);
    }
  }

  /**
   * Classify intent and extract structured data
   */
  async classifyIntent(
    userMessage: string,
    conversationHistory: ConversationMessage[]
  ): Promise<{ intent: string; confidence: number; data?: Record<string, any> }> {
    try {
      const systemPrompt = `You are an intent classifier for a German receptionist AI.
      
Analyze the user's message and determine their intent. Respond ONLY with valid JSON in this format:
{
  "intent": "appointment_booking" | "information_request" | "callback_request" | "emergency" | "complaint" | "other",
  "confidence": 0.0-1.0,
  "data": {
    // Any relevant extracted information (dates, names, phone numbers, etc.)
  }
}

Examples:
- "Ich möchte einen Termin vereinbaren" → {"intent": "appointment_booking", "confidence": 0.95, "data": {}}
- "Wann haben Sie geöffnet?" → {"intent": "information_request", "confidence": 0.9, "data": {}}
- "Ich habe starke Schmerzen" → {"intent": "emergency", "confidence": 0.98, "data": {}}

IMPORTANT: Always respond with valid JSON only. No explanations, no markdown, just the JSON object.`;

      const messages: Anthropic.MessageParam[] = [
        ...conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: userMessage,
        },
      ];

      console.log('Classifying intent for:', userMessage);

      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system: systemPrompt,
        messages,
      });

      const responseText = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '{}';

      console.log('Intent classification raw response:', responseText);

      // Clean up response - remove markdown code blocks if present
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Parse JSON response
      const parsed = JSON.parse(cleanedText);
      
      console.log('Parsed intent:', parsed);

      return {
        intent: parsed.intent || 'other',
        confidence: parsed.confidence || 0.8, // Default to 0.8 instead of 0.3
        data: parsed.data || {},
      };
    } catch (err: any) {
      console.error('Intent classification error:', err.message);
      // Return high confidence for "other" so call doesn't drop
      return {
        intent: 'other',
        confidence: 0.8, // Changed from 0.3 to 0.8
      };
    }
  }

  /**
   * Extract appointment details from conversation
   */
  async extractAppointmentDetails(
    conversationHistory: ConversationMessage[]
  ): Promise<Record<string, any>> {
    try {
      const systemPrompt = `You are extracting appointment booking information from a German conversation.

Extract the following fields if mentioned:
- date: ISO date string (YYYY-MM-DD)
- time: Time string (HH:MM)
- name: Customer name
- phone: Phone number
- reason: Reason for appointment
- email: Email address (if provided)

Respond ONLY with valid JSON. If a field is not mentioned, omit it.

Example:
{"date": "2025-01-15", "time": "14:30", "name": "Max Müller", "reason": "Zahnreinigung"}`;

      const messages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system: systemPrompt,
        messages,
      });

      const responseText = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '{}';

      return JSON.parse(responseText);
    } catch (err) {
      console.error('Appointment extraction error:', err);
      return {};
    }
  }
}

export const claudeService = new ClaudeService();