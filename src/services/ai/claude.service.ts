import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { monitoredOperation } from '../monitoring/monitored-operation.js';
import { alertService, AlertType, MetricType } from '../monitoring/alert.service.js';
import { captureError } from '../../config/sentry.js';

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
    currentUserMessage: string,
    context?: { clientId?: string; callSid?: string }
  ): Promise<ClaudeResponse> {
    return monitoredOperation(
      'claude.generateResponse',
      async () => {
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
          model: 'claude-sonnet-4-5',
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
      },
      context || {}
    );
  }

  /**
   * Classify intent and extract structured data
   */
  async classifyIntent(
    userMessage: string,
    conversationHistory: ConversationMessage[]
  ): Promise<{ intent: string; confidence: number; data?: Record<string, any> }> {
    try {
      const systemPrompt = `SYSTEM ROLE: You are an intent classification parser. You are NOT a conversational AI.

TASK: Analyze the user's message and return a JSON object with their intent.

OUTPUT FORMAT (STRICT):
{
  "intent": "appointment_booking" | "information_request" | "callback_request" | "emergency" | "complaint" | "other",
  "confidence": 0.0-1.0,
  "data": {}
}

INTENT DEFINITIONS:
- appointment_booking: User wants to schedule/change an appointment
- information_request: User asks about hours, services, location, etc.
- callback_request: User wants someone to call them back
- emergency: Urgent situation (pain, immediate help needed)
- complaint: User is unhappy with service
- other: Everything else

RULES:
1. Return ONLY valid JSON
2. NO conversational text
3. NO explanations
4. NO questions
5. NO markdown code blocks

WRONG OUTPUT EXAMPLES (DO NOT DO THIS):
❌ "Vielen Dank! Der 3. Februar ist ein Montag..."
❌ "Perfekt! 13:00 Uhr am 3. Februar passt sehr gut..."
❌ \`\`\`json\\n{"intent": "appointment_booking"}\\n\`\`\`
❌ "Gerne! An welchem Tag möchte Ihr Sohn einen Termin?"
❌ "Zu welcher Uhrzeit passt es Ihnen am besten?"
❌ "Wie ist der Name Ihres Sohnes?"

CORRECT OUTPUT EXAMPLES:
✓ {"intent": "appointment_booking", "confidence": 0.95, "data": {}}
✓ {"intent": "information_request", "confidence": 0.9, "data": {"topic": "hours"}}
✓ {"intent": "emergency", "confidence": 0.98, "data": {}}

YOU ARE A CLASSIFIER, NOT A CONVERSATIONAL AGENT. RETURN ONLY JSON.`;

      // CRITICAL: Only use last 3 messages to prevent Claude from drifting into conversation mode
      const recentHistory = conversationHistory.slice(-3);
      
      const messages: Anthropic.MessageParam[] = [
        ...recentHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: userMessage,
        },
      ];

      console.log('Classifying intent for:', userMessage);
      console.log('Using last', recentHistory.length, 'messages for intent classification');

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        system: systemPrompt,
        messages,
      });

      const responseText = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '{}';

      console.log('Intent classification raw response:', responseText);

      let cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      console.log('After removing markdown:', cleanedText);

      const firstBrace = cleanedText.indexOf('{');
      if (firstBrace === -1) {
        console.log('No JSON object found in intent classification response');
        return {
          intent: 'other',
          confidence: 0.8,
        };
      }

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

      cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
      console.log('Extracted JSON only:', cleanedText);

      const parsed = JSON.parse(cleanedText);
      
      console.log('Parsed intent:', parsed);

      return {
        intent: parsed.intent || 'other',
        confidence: parsed.confidence || 0.8,
        data: parsed.data || {},
      };
    } catch (err: any) {
      console.error('Intent classification error:', err.message);
      // Capture error for monitoring but don't alert (non-critical, has fallback)
      if (err instanceof Error) {
        captureError(err, { operation: 'claude.classifyIntent' });
      }
      alertService.recordMetric(MetricType.OPERATION_FAILURE, 1, {
        operation: 'claude.classifyIntent',
        error: err.message,
      }).catch(() => {});
      return {
        intent: 'other',
        confidence: 0.8,
      };
    }
  }

  /**
   * Extract appointment details from conversation
   * @param conversationHistory - The conversation messages
   * @param maxMessages - Optional limit on messages to use (default: all messages, max 10)
   */
  async extractAppointmentDetails(
    conversationHistory: ConversationMessage[],
    maxMessages?: number
  ): Promise<Record<string, any>> {
    try {
      // Get current date for context
      const now = new Date();
      const currentDateStr = now.toISOString().split('T')[0];
      const currentYear = now.getFullYear();

      const systemPrompt = `YOU ARE A PASSIVE JSON EXTRACTOR. YOU DO NOT HAVE CONVERSATIONS.

YOUR ONLY JOB: Read messages and output JSON.

CURRENT DATE: ${currentDateStr}
CURRENT YEAR: ${currentYear}

EXTRACT THESE FIELDS ONLY:
- date (YYYY-MM-DD) - Use ${currentYear} for dates in the future, or ${currentYear + 1} if the date has already passed this year
- time (HH:MM)
- name - Extract even with trailing punctuation (e.g., "Max," or "Max." should extract as "Max")
- phone - Combine spoken digits (e.g., "9 8 7 3 4 4 1" becomes "9873441")

OUTPUT: Valid JSON object with ONLY the fields found. Nothing else.

ABSOLUTELY FORBIDDEN OUTPUTS:
❌ ANY German text
❌ ANY questions
❌ "Danke, Alex. Haben Sie auch eine Telefonnummer für uns?"
❌ "Gerne! An welchem Tag möchte Ihr Sohn einen Termin?"
❌ "Wunderbar! Zu welcher Uhrzeit möchten Sie kommen?"
❌ ANY text before or after the JSON

ONLY ALLOWED OUTPUTS:
✓ {}
✓ {"date": "${currentYear}-02-03"}
✓ {"date": "${currentYear}-02-03", "time": "14:00"}
✓ {"date": "${currentYear}-02-03", "time": "14:00", "name": "Max", "phone": "123456"}

IF YOU OUTPUT ANYTHING OTHER THAN PURE JSON, YOU HAVE FAILED YOUR TASK.`;

      // CRITICAL: Use maxMessages if provided, otherwise use last 10 messages
      // When booking a NEW appointment, webhook passes a small number (like 2)
      // When continuing an existing appointment, use more context (10)
      const messagesToUse = maxMessages 
        ? conversationHistory.slice(-maxMessages)
        : conversationHistory.slice(-10);
      
      const messages: Anthropic.MessageParam[] = messagesToUse.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      console.log('Extracting appointment from last', messagesToUse.length, 'messages');

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        system: systemPrompt,
        messages,
      });

      const responseText = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '{}';

      console.log('Appointment extraction raw response:', responseText);

      let cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      console.log('After removing markdown:', cleanedText);

      const firstBrace = cleanedText.indexOf('{');
      if (firstBrace === -1) {
        console.log('No JSON object found in response');
        return {};
      }

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
    } catch (err: any) {
      console.error('Appointment extraction error:', err);
      // Capture error for monitoring but don't alert (non-critical, has fallback)
      if (err instanceof Error) {
        captureError(err, { operation: 'claude.extractAppointmentDetails' });
      }
      alertService.recordMetric(MetricType.OPERATION_FAILURE, 1, {
        operation: 'claude.extractAppointmentDetails',
        error: err.message || String(err),
      }).catch(() => {});
      return {};
    }
  }
}

export const claudeService = new ClaudeService();