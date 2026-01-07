'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, type Invitation } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

function RegisterForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [validatingToken, setValidatingToken] = useState(true);

  const { register, user, loading, logout } = useAuth();
  const router = useRouter();
  const [showLogoutPrompt, setShowLogoutPrompt] = useState(false);

  // Check if user is already logged in
  useEffect(() => {
    if (!loading && user && token) {
      setShowLogoutPrompt(true);
    }
  }, [user, loading, token]);

  // Validate invitation token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError('No invitation token provided');
        setValidatingToken(false);
        return;
      }

      try {
        const response = await api.validateInvitation(token);
        setInvitation(response.data);
      } catch (err) {
        setError('Invalid or expired invitation token');
      } finally {
        setValidatingToken(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[a-z]/.test(password)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number');
      return;
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      setError('Password must contain at least one special character');
      return;
    }

    setIsLoading(true);

    try {
      await register(token, name, password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Registration failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle logout action
  const handleLogoutAndContinue = async () => {
    try {
      await logout();
      setShowLogoutPrompt(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Show logout prompt if user is logged in
  if (showLogoutPrompt && user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-[oklch(0.145_0_0)] dark:to-[oklch(0.165_0.02_270)] px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-[oklch(0.185_0.015_270)] rounded-xl shadow-xl p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Already Logged In
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                You&apos;re currently logged in as:
              </p>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 mb-6">
                <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                  {user.role}
                </p>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                To register a new account, you need to log out first.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => router.push('/')}
                  variant="outline"
                  className="flex-1"
                >
                  Go to Dashboard
                </Button>
                <Button
                  onClick={handleLogoutAndContinue}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                >
                  Logout & Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading || validatingToken) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {validatingToken ? 'Validating invitation...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-[oklch(0.145_0_0)] dark:to-[oklch(0.165_0.02_270)] px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-[oklch(0.185_0.015_270)] rounded-xl shadow-xl p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
                Invalid Invitation
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
              <Link href="/login">
                <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
                  Go to Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-[oklch(0.145_0_0)] dark:to-[oklch(0.165_0.02_270)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="bg-white dark:bg-[oklch(0.185_0.015_270)] rounded-xl shadow-xl p-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              Create Your Account
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              You&apos;ve been invited as{' '}
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                {invitation.role}
              </span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Email: {invitation.email}
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                  disabled={isLoading}
                  placeholder="John Doe"
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1"
                  disabled={isLoading}
                  placeholder="••••••••"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Must be 8+ characters with uppercase, lowercase, number & special character
                </p>
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1"
                  disabled={isLoading}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Creating account...
                  </span>
                ) : (
                  'Create Account'
                )}
              </Button>
            </div>

            <div className="text-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Already have an account?{' '}
              </span>
              <Link
                href="/login"
                className="font-medium text-purple-600 hover:text-purple-500 dark:text-purple-400 dark:hover:text-purple-300"
              >
                Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
