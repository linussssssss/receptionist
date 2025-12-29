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
        model: 'claude-haiku-4-5',
        max_tokens: 512,
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

      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleanedText);
      
      console.log('Parsed intent:', parsed);

      return {
        intent: parsed.intent || 'other',
        confidence: parsed.confidence || 0.8,
        data: parsed.data || {},
      };
    } catch (err: any) {
      console.error('Intent classification error:', err.message);
      return {
        intent: 'other',
        confidence: 0.8,
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
      const systemPrompt = `You are a DATA EXTRACTION system. Your job is to READ the conversation and EXTRACT information, NOT to have a conversation.

INSTRUCTIONS:
1. READ the conversation history carefully
2. EXTRACT the following fields if they appear ANYWHERE in the conversation:
   - date: ISO date string (YYYY-MM-DD)
   - time: Time string (HH:MM)
   - name: Customer name
   - phone: Phone number
3. Return ONLY a JSON object with the fields you found
4. If a field is not mentioned anywhere in the conversation, omit it

CRITICAL RULES:
- DO NOT ask questions
- DO NOT generate conversational responses
- DO NOT add explanatory text
- ONLY return the JSON object
- Look through ALL messages in the conversation to find information

Example input conversation:
User: "Ich möchte einen Termin"
Assistant: "Wann möchten Sie kommen?"
User: "Am 15. Januar um 14 Uhr"
Assistant: "Ihr Name bitte?"
User: "Max Müller"

Example output (JSON ONLY):
{"date": "2025-01-15", "time": "14:00", "name": "Max Müller"}

Remember: You are extracting data from an existing conversation, not participating in it.`;

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

      console.log('Appointment extraction raw response:', responseText);

      // Clean up response - remove markdown code blocks if present
      let cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      console.log('After removing markdown:', cleanedText);

      // Sometimes Claude adds extra text after the JSON - extract only the JSON part
      // Find the first { and the matching closing }
      const firstBrace = cleanedText.indexOf('{');
      if (firstBrace === -1) {
        console.log('No JSON object found in response');
        return {};
      }

      // Find the matching closing brace
      let braceCount = 0;
      let lastBrace = firstBrace;
      for (let i = firstBrace; i < cleanedText.length; i++) {
        if (cleanedText[i] === '{') braceCount++;
        if (cleanedText[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            lastBrace = i;
            break;
          }
        }
      }

      // Extract only the JSON portion
      cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
      console.log('Extracted JSON only:', cleanedText);

      const parsed = JSON.parse(cleanedText);

      const allowedFields = ['date', 'time', 'name', 'phone'];
      const filtered = Object.keys(parsed)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = parsed[key];
          return obj;
        }, {} as Record<string, any>);

      console.log('Filtered appointment data:', filtered);

      const requiredFields = ['date', 'time', 'name', 'phone'];
      const missingFields = requiredFields.filter(field => !filtered[field]);
      console.log('Missing fields:', missingFields);

      return filtered;
    } catch (err) {
      console.error('Appointment extraction error:', err);
      return {};
    }
  }
}

export const claudeService = new ClaudeService();