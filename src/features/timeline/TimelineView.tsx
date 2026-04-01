/**
 * TimelineView - Visualize task creation and completion over time
 */

import { useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, Calendar } from 'lucide-react';
import { useTimeline } from './useTimeline';

interface TimelineViewProps {
  defaultDays?: number;
}

export function TimelineView({ defaultDays = 30 }: TimelineViewProps) {
  const { data, loading, error, loadTimeline } = useTimeline();

  useEffect(() => {
    loadTimeline(defaultDays);
  }, [loadTimeline, defaultDays]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-destructive">
        <p>Error loading timeline: {error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // Transform data for chart
  const chartData = data.dates.map((date, index) => ({
    date,
    created: data.created[index],
    completed: data.completed[index],
    cumulativeCreated: data.cumulative.created[index],
    cumulativeCompleted: data.cumulative.completed[index],
  }));

  const totalCreated = data.created.reduce((a, b) => a + b, 0);
  const totalCompleted = data.completed.reduce((a, b) => a + b, 0);
  const completionRate = totalCreated > 0 ? ((totalCompleted / totalCreated) * 100).toFixed(1) : '0';

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <TrendingUp size={16} />
          Task Timeline
        </h3>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Calendar size={12} className="text-muted-foreground" />
            <span className="text-muted-foreground">{defaultDays} days</span>
          </div>
          <div>
            <span className="text-muted-foreground">Created: </span>
            <span className="font-medium">{totalCreated}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Completed: </span>
            <span className="font-medium">{totalCompleted}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Rate: </span>
            <span className="font-medium text-green-500">{completionRate}%</span>
          </div>
        </div>
      </div>

      {/* Daily Tasks Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
            />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
              labelFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="created"
              name="Created"
              stackId="daily"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary) / 0.3)"
            />
            <Area
              type="monotone"
              dataKey="completed"
              name="Completed"
              stackId="daily"
              stroke="hsl(var(--success))"
              fill="hsl(var(--success) / 0.3)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative Progress Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
            />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
              labelFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="cumulativeCreated"
              name="Cumulative Created"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="cumulativeCompleted"
              name="Cumulative Completed"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
