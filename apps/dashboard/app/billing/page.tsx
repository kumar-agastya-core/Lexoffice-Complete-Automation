'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Check } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

interface BillingStatus {
  plan: 'free' | 'starter' | 'pro' | 'agency';
  hasSubscription: boolean;
  docsThisMonth: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
}

const FREE_LIMIT = 50;

const PLAN_DISPLAY: Record<string, { label: string; color: string }> = {
  free: { label: 'Kostenlos', color: 'secondary' },
  starter: { label: 'Starter', color: 'outline' },
  pro: { label: 'Pro', color: 'outline' },
  agency: { label: 'Agency', color: 'outline' },
};

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '€9,90',
    features: [
      'Bis zu 200 Belege/Monat',
      'E-Mail & Web-Upload',
      'Ausnahmen-Tray',
      'Basis-Regeln',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '€29,90',
    features: [
      'Unbegrenzte Belege',
      'Alle Features',
      'Prioritäts-Support',
      'Analytics & Auswertungen',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '€79,90',
    features: [
      'Unbegrenzte Belege',
      'Multi-Mandanten',
      'White-Label',
      'Prioritäts-Support',
    ],
  },
];

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const successParam = searchParams.get('success');
  const canceledParam = searchParams.get('canceled');

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/billing/status');
        if (res.ok) setStatus(await res.json() as BillingStatus);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubscribe(plan: string) {
    setPurchasing(plan);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      }
    } finally {
      setPurchasing(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
      });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  }

  const plan = status?.plan ?? 'free';
  const planDisplay = PLAN_DISPLAY[plan] ?? PLAN_DISPLAY.free;
  const docsUsed = status?.docsThisMonth ?? 0;
  const freePct = Math.min(100, Math.round((docsUsed / FREE_LIMIT) * 100));

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Abrechnung</h1>

      {successParam && (
        <Alert className="border-green-300 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            Abonnement aktiviert! Vielen Dank.
          </AlertDescription>
        </Alert>
      )}
      {canceledParam && (
        <Alert>
          <AlertDescription>Checkout abgebrochen.</AlertDescription>
        </Alert>
      )}

      {/* Current plan card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>Aktueller Plan</CardTitle>
            <Badge variant={planDisplay.color === 'secondary' ? 'secondary' : 'outline'}>{planDisplay.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span>Belege diesen Monat</span>
                  <span className="font-medium">
                    {docsUsed}{plan === 'free' ? ` / ${FREE_LIMIT}` : ''}
                  </span>
                </div>
                {plan === 'free' && (
                  <Progress value={freePct} className="h-2" />
                )}
              </div>
              {plan === 'free' && (
                <p className="text-xs text-muted-foreground">
                  {docsUsed}/{FREE_LIMIT} kostenlose Belege verbraucht
                </p>
              )}
            </>
          )}
        </CardContent>
        {status?.hasSubscription && (
          <CardFooter>
            <Button variant="outline" onClick={handlePortal} disabled={portalLoading}>
              {portalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Abonnement verwalten
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrentPlan = plan === p.id;
          return (
            <Card
              key={p.id}
              className={isCurrentPlan ? 'ring-2 ring-primary' : ''}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {p.name}
                  {isCurrentPlan && <Badge variant="outline">Aktuell</Badge>}
                </CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">{p.price}</span>
                  <span className="text-muted-foreground">/Monat</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {plan === 'free' ? (
                  <Button
                    className="w-full"
                    onClick={() => void handleSubscribe(p.id)}
                    disabled={purchasing !== null}
                  >
                    {purchasing === p.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Jetzt abonnieren
                  </Button>
                ) : isCurrentPlan ? (
                  <Button variant="outline" className="w-full" onClick={handlePortal} disabled={portalLoading}>
                    Verwalten
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    Nicht verfügbar
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
