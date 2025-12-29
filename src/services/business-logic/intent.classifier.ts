import { claudeService } from '../ai/claude.service.js';

export interface IntentResult {
  intent: 'appointment_booking' | 'appointment_modification' | 'information_request' | 
          'callback_request' | 'emergency' | 'complaint' | 'other';
  confidence: number;
  data?: Record<string, any>;
}

export class IntentClassifier {
  /**
   * Classify user intent from their message
   */
  async classify(
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<IntentResult> {
    // Use Claude to classify intent
    const result = await claudeService.classifyIntent(userMessage, conversationHistory);

    return {
      intent: result.intent as IntentResult['intent'],
      confidence: result.confidence,
      data: result.data,
    };
  }

  /**
   * Determine if user needs to be transferred to human
   */
  shouldEscalate(
    intent: string,
    confidence: number,
    conversationHistory: Array<any>,
    escalationRules: any
  ): boolean {
    // Emergency keywords
    if (escalationRules.keywords) {
      const lastMessage = conversationHistory[conversationHistory.length - 1]?.content || '';
      const hasEmergencyKeyword = escalationRules.keywords.some(
        (keyword: string) => lastMessage.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasEmergencyKeyword) {
        return true;
      }
    }

    // DISABLED FOR TESTING: Low confidence escalation
    // Uncomment this block in production to enable automatic escalation after failed attempts
    /*
    if (confidence < 0.4) {
      const recentLowConfidence = conversationHistory
        .slice(-6) // Look at last 6 messages instead of 4
        .filter((msg: any) => msg.role === 'user')
        .length;

      // Changed from 2 to 3 failed attempts
      if (recentLowConfidence >= (escalationRules.transferAfterFailedAttempts || 3)) {
        return true;
      }
    }
    */

    // Explicit transfer request
    if (intent === 'complaint' || intent === 'emergency') {
      return true;
    }

    return false;
  }
}

export const intentClassifier = new IntentClassifier();