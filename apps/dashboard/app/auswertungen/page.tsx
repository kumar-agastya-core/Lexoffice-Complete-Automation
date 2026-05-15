'use client';

import { useState, useEffect } from 'react';
import { Zap, TrendingUp, FileText, BookOpen } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Analytics {
  monthly: Array<{ month: string; total: number; resolved: number; autoPosted: number }>;
  tier: { tier1Count: number; tier2Count: number; totalCount: number; tier1Rate: number };
  fingerprintCount: number;
  weekly: Array<{ week: string; count: number }>;
}

const AUTH_HEADER = { Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? ''}` };

export default function AuswertungenPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/analytics', { headers: AUTH_HEADER });
        if (res.ok) setData(await res.json() as Analytics);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalProcessed = data?.tier.totalCount ?? 0;
  const resolvedCount = data?.monthly.reduce((s, m) => s + m.resolved, 0) ?? 0;

  const metrics = [
    {
      icon: FileText,
      label: 'Belege gesamt',
      value: loading ? null : totalProcessed,
      description: 'Verarbeitet insgesamt',
    },
    {
      icon: Zap,
      label: 'Tier 1 Rate',
      value: loading ? null : `${data?.tier.tier1Rate ?? 0}%`,
      description: 'Automatisch ohne KI gebucht',
    },
    {
      icon: TrendingUp,
      label: 'Erledigt',
      value: loading ? null : resolvedCount,
      description: 'Letzte 6 Monate',
    },
    {
      icon: BookOpen,
      label: 'Lieferantenregeln',
      value: loading ? null : data?.fingerprintCount ?? 0,
      description: 'Gelernte Muster',
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Auswertungen</h1>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ icon: Icon, label, value, description }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {value === null ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{value}</div>
              )}
              <p className="text-xs text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tier breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Verarbeitungs-Tier</CardTitle>
          <CardDescription>Verhältnis automatischer (Tier 1) zu KI-gestützter (Tier 2) Verarbeitung</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-yellow-500" />
                    Tier 1 — Regelbasiert
                  </span>
                  <span className="font-medium">{data?.tier.tier1Count ?? 0}</span>
                </div>
                <Progress value={data?.tier.tier1Rate ?? 0} className="h-2" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                    Tier 2 — KI-Klassifizierung
                  </span>
                  <span className="font-medium">{data?.tier.tier2Count ?? 0}</span>
                </div>
                <Progress value={data ? 100 - data.tier.tier1Rate : 0} className="h-2" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Weekly trend chart */}
      <Card>
        <CardHeader>
          <CardTitle>Wöchentlicher Eingang</CardTitle>
          <CardDescription>Anzahl verarbeiteter Belege pro Woche (letzte 8 Wochen)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data?.weekly ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(l) => `Woche ${String(l).slice(5)}`}
                  formatter={(v) => [v, 'Belege']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#colorCount)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Monthly table */}
      {!loading && (data?.monthly.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monatliche Übersicht</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              <div className="grid grid-cols-4 border-b pb-2 text-xs font-medium text-muted-foreground">
                <span>Monat</span>
                <span className="text-right">Eingang</span>
                <span className="text-right">Erledigt</span>
                <span className="text-right">Auto</span>
              </div>
              {data?.monthly.map((m) => (
                <div key={m.month} className="grid grid-cols-4 border-b py-2 text-sm last:border-0">
                  <span className="font-medium">{m.month}</span>
                  <span className="text-right">{m.total}</span>
                  <span className="text-right">{m.resolved}</span>
                  <span className="text-right text-muted-foreground">{m.autoPosted}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
