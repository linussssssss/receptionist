'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type ClientSettings } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, Settings as SettingsIcon, Calendar } from 'lucide-react';
import { CalendarIntegration } from '@/components/calendar-integration';

function SettingsContent() {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<ClientSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'integrations'>(
    (searchParams.get('tab') as 'general' | 'integrations') || 'general'
  );

  useEffect(() => {
    async function fetchSettings() {
      try {
        setLoading(true);
        const response = await api.getSettings();
        setSettings(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      await api.updateSettings({
        name: settings.name,
        industry: settings.industry,
        email: settings.email,
        greetingMessage: settings.greetingMessage,
        llmSystemPrompt: settings.llmSystemPrompt,
        voiceId: settings.voiceId,
        isActive: settings.isActive,
      });

      setSuccessMessage('Settings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof ClientSettings, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-lg text-gray-500 dark:text-gray-400">Loading settings...</div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-lg text-red-500 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold dark:text-white">Settings</h1>
            <p className="text-gray-500 dark:text-gray-400">Manage your AI receptionist configuration</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={settings.isActive ? 'default' : 'destructive'}>
              {settings.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('general')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'general'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <SettingsIcon className="inline-block w-4 h-4 mr-2" />
              General
            </button>
            <button
              onClick={() => setActiveTab('integrations')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'integrations'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <Calendar className="inline-block w-4 h-4 mr-2" />
              Integrations
            </button>
          </nav>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 rounded-lg">
            {successMessage}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 rounded-lg">
            {error}
          </div>
        )}

        {/* General Tab */}
        {activeTab === 'general' && (
          <>
            {/* Basic Information */}
            <Card className="mb-6">
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>General information about your organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Industry
              </label>
              <select
                value={settings.industry}
                onChange={(e) => handleChange('industry', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="dental">Dental</option>
                <option value="medical">Medical</option>
                <option value="legal">Legal</option>
                <option value="general">General</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={settings.phoneNumber}
                disabled
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Phone number cannot be changed
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={settings.email || ''}
                onChange={(e) => handleChange('email', e.target.value || null)}
                placeholder="contact@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* AI Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>AI Configuration</CardTitle>
            <CardDescription>Configure how the AI receptionist behaves</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Greeting Message
              </label>
              <textarea
                value={settings.greetingMessage}
                onChange={(e) => handleChange('greetingMessage', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="Guten Tag! Hier ist die Praxis Dr. Müller..."
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                The first message callers will hear
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                System Prompt
              </label>
              <textarea
                value={settings.llmSystemPrompt}
                onChange={(e) => handleChange('llmSystemPrompt', e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="Du bist eine freundliche Rezeptionistin..."
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Instructions that define the AI's personality and behavior
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Voice ID (ElevenLabs)
              </label>
              <input
                type="text"
                value={settings.voiceId || ''}
                onChange={(e) => handleChange('voiceId', e.target.value || null)}
                placeholder="21m00Tcm4TlvDq8ikWAM"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                ElevenLabs voice ID for text-to-speech
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Enable or disable the AI receptionist</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium dark:text-white">AI Receptionist Status</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {settings.isActive
                    ? 'Currently accepting and handling calls'
                    : 'Currently disabled - calls will not be answered'}
                </div>
              </div>
              <button
                onClick={() => handleChange('isActive', !settings.isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.isActive ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-200 transition-transform ${
                    settings.isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
            <CardDescription>Information about this configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Client ID</span>
              <span className="font-mono dark:text-gray-200">{settings.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Created</span>
              <span className="dark:text-gray-200">{new Date(settings.createdAt).toLocaleDateString('de-DE')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Last Updated</span>
              <span className="dark:text-gray-200">{new Date(settings.updatedAt).toLocaleDateString('de-DE')}</span>
            </div>
          </CardContent>
        </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                size="lg"
                className="w-full md:w-auto"
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div>
            <CalendarIntegration clientId={settings.id} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <div className="text-lg text-gray-500">Loading settings...</div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
