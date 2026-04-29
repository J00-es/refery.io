'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts'
import { STATUS_CONFIG } from '@/lib/outreach-types'

interface InsightsChartsProps {
  dailyVolume: { date: string; outbound: number; inbound: number }[]
  channelStats: Record<string, { sent: number; replied: number }>
  patternStats: Record<string, { threads: number; replied: number; meetings: number }>
  personaStats: Record<string, { threads: number; replied: number; meetings: number }>
  statusCounts: Record<string, number>
  dayStats: Record<string, { sent: number; replied: number }>
  hookStats: Record<string, { sent: number; replied: number }>
}

const COLORS = ['#059669', '#0891B2', '#7C3AED', '#EA580C', '#DC2626', '#CA8A04', '#16A34A', '#4F46E5']

export function InsightsCharts({
  dailyVolume,
  channelStats,
  patternStats,
  personaStats,
  statusCounts,
  dayStats,
  hookStats
}: InsightsChartsProps) {
  // Prepare channel data for bar chart
  const channelData = Object.entries(channelStats).map(([channel, stats]) => ({
    name: channel.replace('_', ' '),
    sent: stats.sent,
    replied: stats.replied,
    rate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0
  })).sort((a, b) => b.sent - a.sent)

  // Prepare status data for pie chart
  const statusData = Object.entries(statusCounts)
    .filter(([_, count]) => count > 0)
    .map(([status, count]) => ({
      name: STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]?.label || status,
      value: count
    }))

  // Prepare hook data for bar chart
  const hookData = Object.entries(hookStats)
    .filter(([_, stats]) => stats.sent > 5) // Only show hooks used more than 5 times
    .map(([hook, stats]) => ({
      name: hook.replace('_', ' '),
      sent: stats.sent,
      rate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Volume Over Time */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Activity Volume (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyVolume} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOutbound" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorInbound" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0891B2" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0891B2" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="outbound" 
                  stroke="#059669" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorOutbound)" 
                  name="Sent"
                />
                <Area 
                  type="monotone" 
                  dataKey="inbound" 
                  stroke="#0891B2" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorInbound)" 
                  name="Replies"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-600" />
              <span className="text-xs text-muted-foreground">Sent</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-600" />
              <span className="text-xs text-muted-foreground">Replies</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Channel Performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Channel Volume</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="sent" fill="#059669" radius={[0, 4, 4, 0]} name="Sent" />
                <Bar dataKey="replied" fill="#0891B2" radius={[0, 4, 4, 0]} name="Replied" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Thread Status Distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Thread Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {statusData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Hook Performance */}
      {hookData.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hook Effectiveness (Reply Rate %)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hookData} margin={{ top: 0, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10 }} 
                    tickLine={false} 
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickLine={false} 
                    axisLine={false}
                    unit="%"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    formatter={(value: number) => [`${value}%`, 'Reply Rate']}
                  />
                  <Bar dataKey="rate" fill="#059669" radius={[4, 4, 0, 0]} name="Reply Rate" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
