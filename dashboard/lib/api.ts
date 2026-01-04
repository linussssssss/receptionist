const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface ApiResponse<T> {
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  message?: string;
}

export interface Call {
  id: string;
  callSid: string;
  callerNumber: string;
  callerName: string | null;
  status: string;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  intent: string | null;
  client: {
    id: string;
    name: string;
  };
  _count: {
    messages: number;
    appointments: number;
  };
}

export interface Message {
  id: string;
  callId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  timestamp: string;
  latencyMs: number | null;
  audioUrl: string | null;
  tokensUsed: number | null;
  modelUsed: string | null;
}

export interface CallDetail extends Omit<Call, '_count'> {
  client: {
    id: string;
    name: string;
    phoneNumber: string;
  };
  messages: Message[];
  appointments: Appointment[];
}

export interface Appointment {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  datetime: string;
  durationMinutes: number;
  reason: string | null;
  notes: string | null;
  status: string;
  client: {
    id: string;
    name: string;
  };
  call: {
    id: string;
    callSid: string;
    callerNumber: string;
  } | null;
}

export interface AnalyticsSummary {
  totalCalls: number;
  avgDurationSeconds: number;
  appointmentsCreated: number;
  bookingSuccessRate: number;
}

export interface Analytics {
  summary: AnalyticsSummary;
  callsByStatus: Array<{ status: string; count: number }>;
  callsByIntent: Array<{ intent: string; count: number }>;
  callsPerDay: Array<{ date: string; count: number }>;
  dateRange: {
    from: string;
    to: string;
  };
}

export interface ClientSettings {
  id: string;
  name: string;
  industry: string;
  phoneNumber: string;
  email: string | null;
  businessHours: any;
  greetingMessage: string;
  llmSystemPrompt: string;
  voiceId: string | null;
  escalationRules: any;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: HeadersInit = { ...options?.headers };

  // Only set Content-Type if there's a body
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // Calls
  getCalls: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    from?: string;
    to?: string;
    callerNumber?: string;
    clientId?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    const query = searchParams.toString();
    return fetchApi<ApiResponse<Call[]>>(`/api/calls${query ? `?${query}` : ''}`);
  },

  getCall: (id: string) => fetchApi<ApiResponse<CallDetail>>(`/api/calls/${id}`),

  // Appointments
  getAppointments: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    from?: string;
    to?: string;
    clientId?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    const query = searchParams.toString();
    return fetchApi<ApiResponse<Appointment[]>>(`/api/appointments${query ? `?${query}` : ''}`);
  },

  getAppointment: (id: string) => fetchApi<ApiResponse<Appointment>>(`/api/appointments/${id}`),

  updateAppointment: (id: string, data: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string | null;
    datetime?: string;
    durationMinutes?: number;
    reason?: string | null;
    notes?: string | null;
    status?: string;
  }) => {
    return fetchApi<ApiResponse<Appointment>>(`/api/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  cancelAppointment: (id: string) => {
    return fetchApi<ApiResponse<Appointment>>(`/api/appointments/${id}`, {
      method: 'DELETE',
    });
  },

  // Analytics
  getAnalytics: (params?: { from?: string; to?: string; clientId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    const query = searchParams.toString();
    return fetchApi<ApiResponse<Analytics>>(`/api/analytics${query ? `?${query}` : ''}`);
  },

  // Client Settings
  getSettings: (clientId?: string) => {
    const query = clientId ? `?clientId=${clientId}` : '';
    return fetchApi<ApiResponse<ClientSettings>>(`/api/client/settings${query}`);
  },

  updateSettings: (settings: Partial<ClientSettings>, clientId?: string) => {
    const query = clientId ? `?clientId=${clientId}` : '';
    return fetchApi<ApiResponse<ClientSettings>>(`/api/client/settings${query}`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // Google Calendar Integration
  getCalendarAuthUrl: (clientId: string, redirectUri: string) => {
    return fetchApi<{ authUrl: string }>(
      `/api/integrations/google-calendar/auth/url?clientId=${clientId}&redirectUri=${encodeURIComponent(redirectUri)}`
    );
  },

  completeCalendarAuth: (code: string, clientId: string) => {
    return fetchApi<{ success: boolean; message: string }>(
      `/api/integrations/google-calendar/auth/callback`,
      {
        method: 'POST',
        body: JSON.stringify({ code, clientId }),
      }
    );
  },

  disconnectCalendar: (clientId: string) => {
    return fetchApi<{ success: boolean; message: string}>(
      `/api/integrations/google-calendar/disconnect?clientId=${clientId}`,
      { method: 'DELETE' }
    );
  },

  getCalendarStatus: (clientId: string) => {
    return fetchApi<{
      connected: boolean;
      calendarId?: string;
      connectedAt?: string;
      lastSyncAt?: string;
      webhookActive?: boolean;
      webhookExpiration?: string;
    }>(`/api/integrations/google-calendar/status?clientId=${clientId}`);
  },

  manualSync: (clientId: string, appointmentId?: string) => {
    return fetchApi<{ success: boolean; synced: number; failed: number }>(
      `/api/integrations/google-calendar/sync/manual`,
      {
        method: 'POST',
        body: JSON.stringify({ clientId, appointmentId }),
      }
    );
  },
};
