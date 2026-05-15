'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Copy, UploadCloud, UtensilsCrossed, ShoppingBag, Monitor, HardHat, Building2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const BUSINESS_TYPES: Array<{
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
}> = [
  { id: 'gastronomy', label: 'Restaurant / Café / Bar', desc: 'Food & beverage, Lieferando, delivery platforms', icon: UtensilsCrossed },
  { id: 'retail', label: 'Retail / Shop / E-Commerce', desc: 'Product sales, Amazon, eBay, inventory', icon: ShoppingBag },
  { id: 'it_consulting', label: 'IT / Software / Consulting', desc: 'Professional services, software subscriptions', icon: Monitor },
  { id: 'construction', label: 'Construction / Trades / Handwerk', desc: 'Materials, §13b reverse charge, subcontractors', icon: HardHat },
  { id: 'other', label: 'Other Business', desc: 'General business — all standard categories', icon: Building2 },
] as const;

interface ValidationResult { valid: boolean; companyName?: string; vatId?: string; error?: string }
interface CreateResult { tenantId?: string; slug?: string; inboundEmail?: string; error?: string }
interface SyncProgress {
  status: 'pending' | 'running' | 'complete' | 'failed';
  contacts_synced: number;
  categories_cached: number;
  vouchers_learned: number;
  error_message?: string;
}

type Step = 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [businessTypeId, setBusinessTypeId] = useState('');
  const [creating, setCreating] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [inboundEmail, setInboundEmail] = useState('');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [webhooksDone, setWebhooksDone] = useState(false);
  const [error, setError] = useState('');

  // ── Step 1: Validate API key ──────────────────────────────────────────────

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    setValidating(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json() as ValidationResult;
      setValidation(data);
      if (!data.valid) setError(data.error ?? 'Validation failed');
    } catch {
      setError('Network error — check your connection');
    } finally {
      setValidating(false);
    }
  }

  // ── Step 2: Select business type + create tenant ──────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, businessTypeId }),
      });
      const data = await res.json() as CreateResult;
      if (!res.ok || !data.tenantId) { setError(data.error ?? 'Creation failed'); return; }
      setTenantId(data.tenantId);
      setInboundEmail(data.inboundEmail ?? '');
      setStep(3);
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  }

  // ── Step 3: Sync progress polling ────────────────────────────────────────

  const pollProgress = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/onboarding/sync-progress?tenantId=${tenantId}`);
      if (res.ok) setProgress(await res.json() as SyncProgress);
    } catch { /* ignore */ }
  }, [tenantId]);

  const setupWebhooks = useCallback(async () => {
    if (!tenantId || webhooksDone) return;
    try {
      await fetch('/api/onboarding/setup-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      setWebhooksDone(true);
    } catch { /* non-fatal */ }
  }, [tenantId, webhooksDone]);

  useEffect(() => {
    if (step !== 3 || !tenantId) return;
    void fetch('/api/onboarding/start-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId }),
    });
    const id = setInterval(async () => { await pollProgress(); }, 2000);
    void pollProgress();
    return () => clearInterval(id);
  }, [step, tenantId, pollProgress]);

  useEffect(() => {
    if (progress?.status === 'complete' && !webhooksDone) void setupWebhooks();
  }, [progress, webhooksDone, setupWebhooks]);

  useEffect(() => {
    if (progress?.status === 'complete' && webhooksDone) {
      setTimeout(() => setStep(4), 800);
    }
  }, [progress, webhooksDone]);

  const contacts = progress?.contacts_synced ?? 0;
  const categories = progress?.categories_cached ?? 0;
  const vouchers = progress?.vouchers_learned ?? 0;
  const syncPct = Math.min(100, ((contacts + categories + vouchers) / 300) * 100);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg py-8">
      {/* Step indicator */}
      <Progress value={(step / 4) * 100} className="mb-3" />
      <p className="mb-8 text-right text-sm text-muted-foreground">
        Schritt {step} von 4
      </p>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Lexware API-Schlüssel</CardTitle>
            <CardDescription>Verbinden Sie Ihr Lexware Office Konto</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apikey">API-Schlüssel</Label>
              <Input
                id="apikey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoComplete="off"
                className="font-mono"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {validation?.valid && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  Verbunden mit: <strong>{validation.companyName}</strong>
                  {validation.vatId ? ` (${validation.vatId})` : ''}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex gap-3">
            {!validation?.valid ? (
              <Button
                onClick={(e) => void handleValidate(e as unknown as React.FormEvent)}
                disabled={validating || !apiKey.trim()}
                className="w-full"
              >
                {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {validating ? 'Wird geprüft…' : 'Weiter →'}
              </Button>
            ) : (
              <Button onClick={() => setStep(2)} className="w-full">
                Weiter →
              </Button>
            )}
          </CardFooter>
        </Card>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Unternehmenstyp</CardTitle>
            <CardDescription>Damit wir die richtigen Buchungskategorien verwenden</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={businessTypeId} onValueChange={setBusinessTypeId} className="space-y-2">
              {BUSINESS_TYPES.map((bt) => {
                const Icon = bt.icon;
                const selected = businessTypeId === bt.id;
                return (
                  <label
                    key={bt.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-accent/50',
                      selected && 'ring-2 ring-primary',
                    )}
                  >
                    <RadioGroupItem value={bt.id} className="sr-only" />
                    <Icon className={cn('h-5 w-5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{bt.label}</p>
                      <p className="text-xs text-muted-foreground">{bt.desc}</p>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Zurück</Button>
            <Button
              onClick={(e) => void handleCreate(e as unknown as React.FormEvent)}
              disabled={creating || !businessTypeId}
              className="flex-1"
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {creating ? 'Wird eingerichtet…' : 'Konto erstellen'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Initialisierung</CardTitle>
            <CardDescription>Wir synchronisieren Ihre Lexware-Daten</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Progress value={syncPct} className="h-2" />
            <div className="space-y-3">
              {[
                { label: 'Kontakte', value: contacts, done: contacts > 0 },
                { label: 'Buchungskategorien', value: categories, done: categories > 0 },
                { label: 'Belege gelernt', value: vouchers, done: vouchers > 0 },
                { label: 'Webhooks', value: null, done: webhooksDone },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {item.done ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>
                      {item.label}
                    </span>
                  </div>
                  {item.done ? (
                    item.value != null ? (
                      <span className="font-medium">{item.value}</span>
                    ) : (
                      <span className="text-green-600 font-medium">Aktiv</span>
                    )
                  ) : (
                    <Skeleton className="h-4 w-16" />
                  )}
                </div>
              ))}
            </div>
            {progress?.status === 'failed' && (
              <Alert variant="destructive">
                <AlertDescription>Sync-Fehler: {progress.error_message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 4 ── */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <CardTitle>Alles bereit!</CardTitle>
                <CardDescription>Ihr Konto ist eingerichtet</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email section */}
            <div className="space-y-2">
              <Label>Ihre Eingangs-E-Mail-Adresse</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={inboundEmail || 'Wird zugewiesen…'}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (inboundEmail) {
                      void navigator.clipboard.writeText(inboundEmail);
                      toast.success('Kopiert!');
                    }
                  }}
                  disabled={!inboundEmail}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leiten Sie Rechnungen als PDF an diese Adresse weiter
              </p>
            </div>

            {/* Upload shortcut */}
            <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-6">
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Oder laden Sie jetzt einen Beleg hoch
              </p>
              <Button variant="outline" size="sm" onClick={() => router.push('/upload')}>
                Zur Upload-Seite
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => router.push('/exceptions')}>
              Zum Dashboard
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
