'use client';

import { useEffect, useState } from 'react';
import { api, type Analytics } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Phone,
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Users,
} from 'lucide-react';

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setLoading(true);

        // Calculate date range
        const to = new Date();
        const from = new Date();
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        from.setDate(from.getDate() - days);

        const response = await api.getAnalytics({
          from: from.toISOString(),
          to: to.toISOString(),
        });
        setAnalytics(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [dateRange]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-lg text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-lg text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!analytics) return null;

  const { summary, callsByStatus, callsByIntent, callsPerDay } = analytics;

  // Calculate trends
  const recentCalls = callsPerDay.slice(0, 7);
  const olderCalls = callsPerDay.slice(7, 14);
  const recentTotal = recentCalls.reduce((sum, day) => sum + day.count, 0);
  const olderTotal = olderCalls.reduce((sum, day) => sum + day.count, 0);
  const callTrend = olderTotal > 0 ? ((recentTotal - olderTotal) / olderTotal) * 100 : 0;

  // Calculate completion rate
  const completedCalls = callsByStatus.find((s) => s.status === 'COMPLETED')?.count || 0;
  const totalCallsFromStatus = callsByStatus.reduce((sum, s) => sum + s.count, 0);
  const completionRate = totalCallsFromStatus > 0 ? (completedCalls / totalCallsFromStatus) * 100 : 0;

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-8">
        {/* Header with Date Range Selector */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Analytics</h1>
            <p className="text-gray-500">
              Detailed insights and performance metrics
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={dateRange === '7d' ? 'default' : 'outline'}
              onClick={() => setDateRange('7d')}
            >
              Last 7 Days
            </Button>
            <Button
              variant={dateRange === '30d' ? 'default' : 'outline'}
              onClick={() => setDateRange('30d')}
            >
              Last 30 Days
            </Button>
            <Button
              variant={dateRange === '90d' ? 'default' : 'outline'}
              onClick={() => setDateRange('90d')}
            >
              Last 90 Days
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
              <Phone className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalCalls}</div>
              <div className="flex items-center text-xs mt-1">
                {callTrend > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-600 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600 mr-1" />
                )}
                <span className={callTrend > 0 ? 'text-green-600' : 'text-red-600'}>
                  {Math.abs(callTrend).toFixed(1)}%
                </span>
                <span className="text-gray-500 ml-1">vs previous period</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Appointments Booked</CardTitle>
              <Calendar className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.appointmentsCreated}</div>
              <p className="text-xs text-gray-500 mt-1">
                {summary.bookingSuccessRate.toFixed(1)}% conversion rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Call Duration</CardTitle>
              <Clock className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatDuration(summary.avgDurationSeconds)}
              </div>
              <p className="text-xs text-gray-500 mt-1">Per completed call</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completionRate.toFixed(1)}%</div>
              <p className="text-xs text-gray-500 mt-1">
                {completedCalls} of {totalCallsFromStatus} calls
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Call Volume Over Time */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Call Volume Over Time</CardTitle>
            <CardDescription>Daily call volume for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {callsPerDay.map((item) => {
                const maxCount = Math.max(...callsPerDay.map((d) => d.count));
                const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;

                return (
                  <div key={item.date} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        {new Date(item.date).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="font-medium">{item.count} calls</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Distribution Charts */}
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          {/* Call Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Call Status Distribution</CardTitle>
              <CardDescription>Breakdown of all call statuses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {callsByStatus.map((item) => {
                  const percentage = summary.totalCalls > 0 ? (item.count / summary.totalCalls) * 100 : 0;

                  return (
                    <div key={item.status} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.status}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            {percentage.toFixed(1)}%
                          </span>
                          <span className="font-medium">{item.count}</span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-600 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Call Intent Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Call Intent Distribution</CardTitle>
              <CardDescription>What callers wanted to achieve</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {callsByIntent.map((item) => {
                  const percentage = summary.totalCalls > 0 ? (item.count / summary.totalCalls) * 100 : 0;

                  return (
                    <div key={item.intent || 'unknown'} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.intent || 'Unknown'}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            {percentage.toFixed(1)}%
                          </span>
                          <span className="font-medium">{item.count}</span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-600 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Insights */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Insights</CardTitle>
            <CardDescription>Key observations and recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <BarChart3 className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <div className="font-medium text-blue-900">
                    Booking Success Rate: {summary.bookingSuccessRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-blue-700">
                    {summary.appointmentsCreated} appointments were successfully booked from{' '}
                    {summary.totalCalls} total calls.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <div className="font-medium text-green-900">
                    Call Completion: {completionRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-green-700">
                    {completedCalls} out of {totalCallsFromStatus} calls were successfully completed.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                <Users className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <div className="font-medium text-purple-900">
                    Average Call Duration: {formatDuration(summary.avgDurationSeconds)}
                  </div>
                  <div className="text-sm text-purple-700">
                    The average conversation length suggests efficient call handling.
                  </div>
                </div>
              </div>

              {callTrend !== 0 && (
                <div className={`flex items-start gap-3 p-3 rounded-lg ${
                  callTrend > 0 ? 'bg-green-50' : 'bg-orange-50'
                }`}>
                  {callTrend > 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-orange-600 mt-0.5" />
                  )}
                  <div>
                    <div className={`font-medium ${
                      callTrend > 0 ? 'text-green-900' : 'text-orange-900'
                    }`}>
                      Call Volume Trend: {callTrend > 0 ? '+' : ''}{callTrend.toFixed(1)}%
                    </div>
                    <div className={`text-sm ${
                      callTrend > 0 ? 'text-green-700' : 'text-orange-700'
                    }`}>
                      {callTrend > 0
                        ? 'Call volume is increasing compared to the previous period.'
                        : 'Call volume is decreasing compared to the previous period.'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
