'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type CallDetail, type Message } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Phone,
  Clock,
  Calendar,
  User,
  MessageSquare,
} from 'lucide-react';

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  COMPLETED: 'default',
  IN_PROGRESS: 'secondary',
  FAILED: 'destructive',
  RINGING: 'outline',
  NO_ANSWER: 'outline',
  BUSY: 'outline',
  CANCELLED: 'destructive',
};

export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [call, setCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCall() {
      try {
        setLoading(true);
        const response = await api.getCall(id);
        setCall(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load call');
      } finally {
        setLoading(false);
      }
    }

    fetchCall();
  }, [id]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-lg text-gray-500">Loading call details...</div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-red-500 mb-4">
            {error || 'Call not found'}
          </div>
          <Button onClick={() => router.push('/calls')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Calls
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push('/calls')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Calls
        </Button>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold">Call Details</h1>
            <Badge variant={STATUS_COLORS[call.status] || 'outline'}>
              {call.status}
            </Badge>
          </div>
          <p className="text-gray-500">Call ID: {call.callSid}</p>
        </div>

        {/* Call Information Cards */}
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Caller</CardTitle>
              <User className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {call.callerName || 'Unknown'}
              </div>
              <p className="text-xs text-gray-500">{call.callerNumber}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Duration</CardTitle>
              <Clock className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {formatDuration(call.duration)}
              </div>
              <p className="text-xs text-gray-500">
                {call.endTime ? 'Completed' : 'In progress'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{call.messages.length}</div>
              <p className="text-xs text-gray-500">Exchanges</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Intent</CardTitle>
              <Phone className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {call.intent ? (
                  <Badge variant="outline">{call.intent}</Badge>
                ) : (
                  <span className="text-sm text-gray-400">-</span>
                )}
              </div>
              <p className="text-xs text-gray-500">Detected intent</p>
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Call Timeline</CardTitle>
              <CardDescription>Call start and end times</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">Started</div>
                <div className="font-medium">{formatDate(call.startTime)}</div>
              </div>
              {call.endTime && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">Ended</div>
                  <div className="font-medium">{formatDate(call.endTime)}</div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">Client</div>
                <div className="font-medium">{call.client.name}</div>
              </div>
            </CardContent>
          </Card>

          {/* Appointments */}
          <Card>
            <CardHeader>
              <CardTitle>Appointments</CardTitle>
              <CardDescription>Booked during this call</CardDescription>
            </CardHeader>
            <CardContent>
              {call.appointments.length === 0 ? (
                <div className="text-sm text-gray-500">No appointments booked</div>
              ) : (
                <div className="space-y-3">
                  {call.appointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="p-3 rounded-lg border bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium">{appointment.customerName}</div>
                        <Badge variant="outline">{appointment.status}</Badge>
                      </div>
                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {formatDate(appointment.datetime)}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {appointment.customerPhone}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle>Conversation Transcript</CardTitle>
            <CardDescription>
              Full transcript of the call conversation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {call.messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No messages recorded
                </div>
              ) : (
                call.messages.map((message: Message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === 'USER' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        message.role === 'USER'
                          ? 'bg-gray-100 text-gray-900'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold">
                          {message.role === 'USER' ? 'Caller' : 'AI Receptionist'}
                        </span>
                        <span className="text-xs opacity-70">
                          {formatTime(message.timestamp)}
                        </span>
                        {message.latencyMs && (
                          <span className="text-xs opacity-70">
                            ({message.latencyMs}ms)
                          </span>
                        )}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
