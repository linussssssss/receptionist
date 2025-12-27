export interface TwilioIncomingCallEvent {
    CallSid: string;
    AccountSid: string;
    From: string;
    To: string;
    CallStatus: 'ringing' | 'in-progress' | 'completed' | 'busy' | 'no-answer' | 'canceled' | 'failed';
    Direction: 'inbound' | 'outbound-api' | 'outbound-dial';
    CallerName?: string;
    CallerCountry?: string;
    CallerState?: string;
    CallerCity?: string;
    CallerZip?: string;
}

export interface TwilioCallStatusEvent {
    CallSid: string;
    CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
    CallDuration?: string;
    RecordingUrl?: string;
    RecordingSid?: string;
    From: string;
    To: string;
    Timestamp: string;
}

export interface TwilioGatherEvent {
    CallSid: string;
    Digits?: string;
    SpeechResult?: string;
    Confidence?: string;
}

export interface CallSessionData {
    callId: string;
    clientId: string;
    callerNumber: string;
    status: 'ringing' | 'answered' | 'in-progress' | 'ended';
    startTime: Date;
    conversationHistory: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date;
    }>;
    intent?: string;
    collectedData?: Record<string, any>;
}

export interface TwiMLResponse {
    toString(): string;
}