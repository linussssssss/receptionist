import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callSessionManager } from './call-session.manager.js';

describe('CallSessionManager', () => {
  beforeEach(() => {
    // Clear all sessions before each test
    // Access internal sessions map to clear it
    const sessions = (callSessionManager as any).sessions as Map<string, any>;
    sessions.clear();
  });

  describe('createSession', () => {
    it('creates a new session with correct data', () => {
      const session = callSessionManager.createSession(
        'call-123',
        'client-456',
        '+49123456789'
      );

      expect(session.callId).toBe('call-123');
      expect(session.clientId).toBe('client-456');
      expect(session.callerNumber).toBe('+49123456789');
      expect(session.status).toBe('ringing');
      expect(session.conversationHistory).toEqual([]);
      expect(session.startTime).toBeInstanceOf(Date);
    });

    it('stores session for later retrieval', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      const retrieved = callSessionManager.getSession('call-123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.callId).toBe('call-123');
    });
  });

  describe('getSession', () => {
    it('returns existing session', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      const session = callSessionManager.getSession('call-123');
      expect(session).toBeDefined();
      expect(session?.callId).toBe('call-123');
    });

    it('returns undefined for non-existent session', () => {
      const session = callSessionManager.getSession('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('updateSessionStatus', () => {
    it('updates session status', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      callSessionManager.updateSessionStatus('call-123', 'in-progress');

      const session = callSessionManager.getSession('call-123');
      expect(session?.status).toBe('in-progress');
    });

    it('does nothing for non-existent session', () => {
      // Should not throw
      callSessionManager.updateSessionStatus('non-existent', 'in-progress');
    });
  });

  describe('addMessage', () => {
    it('adds message to conversation history', async () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      await callSessionManager.addMessage('call-123', 'user', 'Hello');

      const session = callSessionManager.getSession('call-123');
      expect(session?.conversationHistory).toHaveLength(1);
      expect(session?.conversationHistory[0].role).toBe('user');
      expect(session?.conversationHistory[0].content).toBe('Hello');
      expect(session?.conversationHistory[0].timestamp).toBeInstanceOf(Date);
    });

    it('adds multiple messages in order', async () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      await callSessionManager.addMessage('call-123', 'assistant', 'Welcome');
      await callSessionManager.addMessage('call-123', 'user', 'I need an appointment');
      await callSessionManager.addMessage('call-123', 'assistant', 'Sure, when?');

      const session = callSessionManager.getSession('call-123');
      expect(session?.conversationHistory).toHaveLength(3);
      expect(session?.conversationHistory[0].role).toBe('assistant');
      expect(session?.conversationHistory[1].role).toBe('user');
      expect(session?.conversationHistory[2].role).toBe('assistant');
    });

    it('does nothing for non-existent session', async () => {
      // Should not throw
      await callSessionManager.addMessage('non-existent', 'user', 'Hello');
    });
  });

  describe('updateCollectedData', () => {
    it('merges new data with existing', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      callSessionManager.updateCollectedData('call-123', { name: 'John' });
      callSessionManager.updateCollectedData('call-123', { phone: '+49111222333' });

      const session = callSessionManager.getSession('call-123');
      expect(session?.collectedData).toEqual({
        name: 'John',
        phone: '+49111222333',
      });
    });

    it('overwrites existing fields', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      callSessionManager.updateCollectedData('call-123', { name: 'John' });
      callSessionManager.updateCollectedData('call-123', { name: 'Jane' });

      const session = callSessionManager.getSession('call-123');
      expect(session?.collectedData?.name).toBe('Jane');
    });

    it('clears data when empty object passed', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      callSessionManager.updateCollectedData('call-123', { name: 'John', phone: '+49111222333' });
      callSessionManager.updateCollectedData('call-123', {});

      const session = callSessionManager.getSession('call-123');
      expect(session?.collectedData).toEqual({});
    });

    it('does nothing for non-existent session', () => {
      // Should not throw
      callSessionManager.updateCollectedData('non-existent', { name: 'John' });
    });
  });

  describe('setIntent', () => {
    it('sets intent on session', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      callSessionManager.setIntent('call-123', 'appointment_booking');

      const session = callSessionManager.getSession('call-123');
      expect(session?.intent).toBe('appointment_booking');
    });

    it('overwrites existing intent', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      callSessionManager.setIntent('call-123', 'information_request');
      callSessionManager.setIntent('call-123', 'appointment_booking');

      const session = callSessionManager.getSession('call-123');
      expect(session?.intent).toBe('appointment_booking');
    });

    it('does nothing for non-existent session', () => {
      // Should not throw
      callSessionManager.setIntent('non-existent', 'appointment_booking');
    });
  });

  describe('endSession', () => {
    it('marks session as ended', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      const endedSession = callSessionManager.endSession('call-123');

      expect(endedSession?.status).toBe('ended');
    });

    it('returns the ended session', () => {
      callSessionManager.createSession('call-123', 'client-456', '+49123456789');

      const endedSession = callSessionManager.endSession('call-123');

      expect(endedSession).toBeDefined();
      expect(endedSession?.callId).toBe('call-123');
    });

    it('returns undefined for non-existent session', () => {
      const result = callSessionManager.endSession('non-existent');
      expect(result).toBeUndefined();
    });

    // Note: cleanup after 5 minutes is tested implicitly - we don't test timers here
  });

  describe('getActiveSessions', () => {
    it('returns empty array when no sessions', () => {
      const active = callSessionManager.getActiveSessions();
      expect(active).toEqual([]);
    });

    it('returns only non-ended sessions', () => {
      callSessionManager.createSession('call-1', 'client-456', '+49111111111');
      callSessionManager.createSession('call-2', 'client-456', '+49222222222');
      callSessionManager.createSession('call-3', 'client-456', '+49333333333');

      callSessionManager.endSession('call-2');

      const active = callSessionManager.getActiveSessions();
      expect(active).toHaveLength(2);
      expect(active.map((s) => s.callId)).toContain('call-1');
      expect(active.map((s) => s.callId)).toContain('call-3');
      expect(active.map((s) => s.callId)).not.toContain('call-2');
    });
  });

  describe('getSessionCount', () => {
    it('returns 0 when no sessions', () => {
      expect(callSessionManager.getSessionCount()).toBe(0);
    });

    it('returns correct count', () => {
      callSessionManager.createSession('call-1', 'client-456', '+49111111111');
      callSessionManager.createSession('call-2', 'client-456', '+49222222222');

      expect(callSessionManager.getSessionCount()).toBe(2);
    });

    it('includes ended sessions in count', () => {
      callSessionManager.createSession('call-1', 'client-456', '+49111111111');
      callSessionManager.createSession('call-2', 'client-456', '+49222222222');
      callSessionManager.endSession('call-1');

      // Ended sessions are still in the map (cleaned up after 5 minutes)
      expect(callSessionManager.getSessionCount()).toBe(2);
    });
  });
});
