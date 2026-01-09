'use client';

import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Check, Calendar, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface CalendarStatus {
  connected: boolean;
  calendarId?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  webhookActive?: boolean;
  webhookExpiration?: string;
}

export function CalendarIntegration({ clientId }: { clientId: string }) {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getCalendarStatus(clientId);
      setStatus(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load calendar status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [clientId]);

  const handleConnect = async () => {
    try {
      setError(null);
      const redirectUri = `${window.location.origin}/settings/integrations/callback`;
      const { authUrl } = await api.getCalendarAuthUrl(clientId, redirectUri);
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.message || 'Failed to initiate connection');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Google Calendar? Future appointments won\'t be synced.')) {
      return;
    }

    try {
      setError(null);
      await api.disconnectCalendar(clientId);
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect calendar');
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      const result = await api.manualSync(clientId);
      alert(`Sync complete! Synced: ${result.synced}, Failed: ${result.failed}`);
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to sync');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
              <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status?.connected) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                <Calendar className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <h4 className="font-medium dark:text-white">Google Calendar</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Not connected - Appointments won't sync to calendar
                </p>
              </div>
            </div>
            <Button onClick={handleConnect}>
              Connect Calendar
            </Button>
          </div>
          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-medium dark:text-white">Google Calendar Connected</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connected on {new Date(status.connectedAt!).toLocaleDateString()}
                </p>
                {status.lastSyncAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Last sync: {new Date(status.lastSyncAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <Button variant="outline" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Status Card */}
      <Card>
        <CardContent className="p-6">
          <h4 className="font-medium mb-4 dark:text-white">Sync Status</h4>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 border dark:border-gray-700 rounded">
              <div className="text-sm text-gray-600 dark:text-gray-400">Calendar ID</div>
              <div className="text-lg font-medium dark:text-white">{status.calendarId || 'primary'}</div>
            </div>
            <div className="p-3 border dark:border-gray-700 rounded">
              <div className="text-sm text-gray-600 dark:text-gray-400">Webhook Status</div>
              <div className="text-lg font-medium dark:text-white">
                {status.webhookActive ? (
                  <span className="text-green-600 dark:text-green-400">Active</span>
                ) : (
                  <span className="text-red-600 dark:text-red-400">Inactive</span>
                )}
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={handleManualSync}
            disabled={syncing}
            className="w-full"
          >
            {syncing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Now
              </>
            )}
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 text-center">
            Manually sync all pending appointments to Google Calendar
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
