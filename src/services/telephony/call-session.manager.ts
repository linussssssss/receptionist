import type { CallSessionData } from '../../types/twilio.js';

/**
 * Manages active call sessions in memory
 * For production, this should use Redis for distributed systems
 */
class CallSessionManager {
  private sessions: Map<string, CallSessionData> = new Map();

  /**
   * Create a new call session
   */
  createSession(callId: string, clientId: string, callerNumber: string): CallSessionData {
    const session: CallSessionData = {
      callId,
      clientId,
      callerNumber,
      status: 'ringing',
      startTime: new Date(),
      conversationHistory: [],
    };

    this.sessions.set(callId, session);
    return session;
  }

  /**
   * Get existing session
   */
  getSession(callId: string): CallSessionData | undefined {
    return this.sessions.get(callId);
  }

  /**
   * Update session status
   */
  updateSessionStatus(
    callId: string,
    status: CallSessionData['status']
  ): void {
    const session = this.sessions.get(callId);
    if (session) {
      session.status = status;
    }
  }

  /**
   * Add message to conversation history
   */
  async addMessage(
    callId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    const session = this.sessions.get(callId);
    if (session) {
      session.conversationHistory.push({
        role,
        content,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Update collected data (for appointment booking, etc.)
   * Pass an empty object {} to clear all collected data
   */
  updateCollectedData(
    callId: string,
    data: Record<string, any>
  ): void {
    const session = this.sessions.get(callId);
    if (session) {
      // If empty object passed, clear the data instead of merging
      if (Object.keys(data).length === 0) {
        session.collectedData = {};
      } else {
        session.collectedData = {
          ...session.collectedData,
          ...data,
        };
      }
    }
  }

  /**
   * Set intent for the call
   */
  setIntent(callId: string, intent: string): void {
    const session = this.sessions.get(callId);
    if (session) {
      session.intent = intent;
    }
  }

  /**
   * End session and clean up
   */
  endSession(callId: string): CallSessionData | undefined {
    const session = this.sessions.get(callId);
    if (session) {
      session.status = 'ended';
      // Keep in memory for a bit for logging, then clean up
      setTimeout(() => {
        this.sessions.delete(callId);
      }, 300000); // 5 minutes
    }
    return session;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): CallSessionData[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status !== 'ended'
    );
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}

export const callSessionManager = new CallSessionManager();