'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, tokenStorage, type User } from './api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (invitationToken: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  /**
   * Load user from token on mount
   */
  useEffect(() => {
    const loadUser = async () => {
      try {
        const accessToken = tokenStorage.getAccessToken();
        if (accessToken) {
          const response = await api.getCurrentUser();
          setUser(response.data);
        }
      } catch (error) {
        console.error('Failed to load user:', error);
        // Clear invalid tokens
        tokenStorage.clearTokens();
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  /**
   * Login with email and password
   */
  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const user = await api.login(email, password);
        setUser(user);
        router.push('/');
      } catch (error) {
        console.error('Login failed:', error);
        throw error;
      }
    },
    [router]
  );

  /**
   * Register with invitation token
   */
  const register = useCallback(
    async (invitationToken: string, name: string, password: string) => {
      try {
        const user = await api.register(invitationToken, name, password);
        setUser(user);
        router.push('/');
      } catch (error) {
        console.error('Registration failed:', error);
        throw error;
      }
    },
    [router]
  );

  /**
   * Logout and clear session
   */
  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setUser(null);
      router.push('/login');
    }
  }, [router]);

  /**
   * Refresh current user data
   */
  const refreshUser = useCallback(async () => {
    try {
      const response = await api.getCurrentUser();
      setUser(response.data);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      throw error;
    }
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * HOC to require authentication for a component
 */
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading && !user) {
        router.push('/login');
      }
    }, [user, loading, router]);

    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-sm text-gray-600">Loading...</p>
          </div>
        </div>
      );
    }

    if (!user) {
      return null;
    }

    return <Component {...props} />;
  };
}

/**
 * HOC to require admin role for a component
 */
export function withAdminAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AdminAuthenticatedComponent(props: P) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading) {
        if (!user) {
          router.push('/login');
        } else if (user.role !== 'ADMIN') {
          router.push('/');
        }
      }
    }, [user, loading, router]);

    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-sm text-gray-600">Loading...</p>
          </div>
        </div>
      );
    }

    if (!user || user.role !== 'ADMIN') {
      return null;
    }

    return <Component {...props} />;
  };
}
