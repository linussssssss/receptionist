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

// ============================================================
// Authentication Types & Token Management
// ============================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
  clientId: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  inviter?: {
    id: string;
    name: string;
    email: string;
  };
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

// Token storage utilities
export const tokenStorage = {
  getAccessToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },

  setAccessToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },

  getRefreshToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setRefreshToken: (token: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  },

  clearTokens: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  setTokens: (accessToken: string, refreshToken: string): void => {
    tokenStorage.setAccessToken(accessToken);
    tokenStorage.setRefreshToken(refreshToken);
  },
};

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
  reminderSent: boolean;
  reminderSentAt: string | null;
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
  uniqueCustomers: number;
  returningCustomers: number;
  retentionRate: number;
}

export interface Analytics {
  summary: AnalyticsSummary;
  callsByStatus: Array<{ status: string; count: number }>;
  callsByIntent: Array<{ intent: string; count: number }>;
  appointmentsByStatus: Array<{ status: string; count: number }>;
  callsByHour: Array<{ hour: number; count: number }>;
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

// Track if we're currently refreshing to avoid multiple refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(): Promise<string> {
  // If already refreshing, return the existing promise
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data: ApiResponse<{ accessToken: string }> = await response.json();
      const newAccessToken = data.data.accessToken;
      tokenStorage.setAccessToken(newAccessToken);

      return newAccessToken;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) };

  // Add Authorization header if token exists (unless explicitly skipped)
  if (!options?.skipAuth) {
    const accessToken = tokenStorage.getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
  }

  // Only set Content-Type if there's a body
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  let response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // If unauthorized and we have a refresh token, try to refresh and retry
  if (response.status === 401 && !options?.skipAuth) {
    try {
      const newAccessToken = await refreshAccessToken();

      // Retry the original request with new token
      headers['Authorization'] = `Bearer ${newAccessToken}`;
      response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (error) {
      // Refresh failed, clear tokens and redirect to login
      tokenStorage.clearTokens();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Authentication failed');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || errorData.message || `API error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // ============================================================
  // Authentication
  // ============================================================

  /**
   * Login with email and password
   */
  login: async (email: string, password: string): Promise<User> => {
    const response = await fetchApi<ApiResponse<LoginResponse>>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });

    // Store tokens
    tokenStorage.setTokens(response.data.accessToken, response.data.refreshToken);

    return response.data.user;
  },

  /**
   * Register with invitation token
   */
  register: async (
    invitationToken: string,
    name: string,
    password: string
  ): Promise<User> => {
    const response = await fetchApi<ApiResponse<LoginResponse>>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ invitationToken, name, password }),
      skipAuth: true,
    });

    // Store tokens
    tokenStorage.setTokens(response.data.accessToken, response.data.refreshToken);

    return response.data.user;
  },

  /**
   * Logout (invalidate session)
   */
  logout: async (): Promise<void> => {
    try {
      await fetchApi('/api/auth/logout', { method: 'POST' });
    } finally {
      // Clear tokens even if request fails
      tokenStorage.clearTokens();
    }
  },

  /**
   * Get current user info
   */
  getCurrentUser: () => fetchApi<ApiResponse<User>>('/api/auth/me'),

  /**
   * Change password
   */
  changePassword: (currentPassword: string, newPassword: string) => {
    return fetchApi<ApiResponse<{ message: string }>>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  /**
   * Validate invitation token (public endpoint)
   */
  validateInvitation: (token: string) => {
    return fetchApi<ApiResponse<Invitation>>(`/api/auth/invitations/validate?token=${token}`, {
      skipAuth: true,
    });
  },

  // Admin-only endpoints
  /**
   * Invite a new user (Admin only)
   */
  inviteUser: (email: string, role: 'ADMIN' | 'STAFF') => {
    return fetchApi<ApiResponse<Invitation>>('/api/auth/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  /**
   * Get all invitations (Admin only)
   */
  getInvitations: () => {
    return fetchApi<ApiResponse<Invitation[]>>('/api/auth/invitations');
  },

  /**
   * Revoke invitation (Admin only)
   */
  revokeInvitation: (id: string) => {
    return fetchApi<ApiResponse<{ message: string }>>(`/api/auth/invitations/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get all users in client (Admin only)
   */
  getUsers: () => {
    return fetchApi<ApiResponse<User[]>>('/api/auth/users');
  },

  /**
   * Update user (Admin only)
   */
  updateUser: (id: string, updates: { isActive?: boolean; role?: 'ADMIN' | 'STAFF' }) => {
    return fetchApi<ApiResponse<User>>(`/api/auth/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // ============================================================
  // Calls
  // ============================================================
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
