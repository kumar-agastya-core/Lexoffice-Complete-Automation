'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Eye, EyeOff } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Settings {
  companyName: string;
  vatId: string | null;
  businessType: string | null;
  approvalThreshold: number;
  autoPost: boolean;
  hasApiKey: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const [threshold, setThreshold] = useState(5000);
  const [thresholdInput, setThresholdInput] = useState('5000');
  const [autoPost, setAutoPost] = useState(true);
  const [savingBehavior, setSavingBehavior] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? ''}` },
        });
        if (res.ok) {
          const data = await res.json() as Settings;
          setSettings(data);
          setThreshold(data.approvalThreshold);
          setThresholdInput(String(data.approvalThreshold));
          setAutoPost(data.autoPost);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveBehavior() {
    setSavingBehavior(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? ''}`,
        },
        body: JSON.stringify({ approvalThreshold: threshold, autoPost }),
      });
      if (res.ok) {
        toast.success('Einstellungen gespeichert');
      } else {
        const data = await res.json() as { error?: string };
        toast.error(data.error ?? 'Fehler beim Speichern');
      }
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setSavingBehavior(false);
    }
  }

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    setSavingKey(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? ''}`,
        },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      if (res.ok) {
        toast.success('API-Schlüssel aktualisiert');
        setApiKey('');
        setSettings((s) => s ? { ...s, hasApiKey: true } : s);
      } else {
        const data = await res.json() as { error?: string };
        toast.error(data.error ?? 'Ungültiger API-Schlüssel');
      }
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setSavingKey(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Einstellungen</h1>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Einstellungen</h1>

      {/* ── KI-Verhalten ── */}
      <Card>
        <CardHeader>
          <CardTitle>KI-Verhalten</CardTitle>
          <CardDescription>Steuern Sie, wann der Agent automatisch bucht</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Genehmigungsschwelle</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">€</span>
                <Input
                  className="w-28 text-right"
                  value={thresholdInput}
                  onChange={(e) => {
                    setThresholdInput(e.target.value);
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n) && n >= 0) setThreshold(n);
                  }}
                />
              </div>
            </div>
            <Slider
              min={0}
              max={50000}
              step={500}
              value={[threshold]}
              onValueChange={([v]) => {
                setThreshold(v ?? threshold);
                setThresholdInput(String(v ?? threshold));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Belege über diesem Betrag werden als &quot;Zu prüfen&quot; markiert und benötigen Ihre Genehmigung.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Automatisch buchen</Label>
              <p className="text-sm text-muted-foreground">
                Bekannte Belege direkt in Lexware buchen ohne Ihr Zutun
              </p>
            </div>
            <Switch checked={autoPost} onCheckedChange={setAutoPost} />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={saveBehavior} disabled={savingBehavior}>
            {savingBehavior ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Speichern
          </Button>
        </CardFooter>
      </Card>

      {/* ── Lexware-Verbindung ── */}
      <Card>
        <CardHeader>
          <CardTitle>Lexware-Verbindung</CardTitle>
          <CardDescription>API-Schlüssel für den Zugriff auf Ihr Lexware Office Konto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            {settings?.hasApiKey ? (
              <Badge variant="outline" className="text-green-600">Verbunden</Badge>
            ) : (
              <Badge variant="destructive">Nicht konfiguriert</Badge>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="apikey">Neuer API-Schlüssel</Label>
            <div className="flex gap-2">
              <Input
                id="apikey"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="font-mono"
                autoComplete="off"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowKey((v) => !v)}
                type="button"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Schlüssel wird validiert und verschlüsselt gespeichert
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={saveApiKey} disabled={savingKey || !apiKey.trim()}>
            {savingKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {savingKey ? 'Wird validiert…' : 'Schlüssel aktualisieren'}
          </Button>
        </CardFooter>
      </Card>

      {/* ── Konto-Informationen ── */}
      <Card>
        <CardHeader>
          <CardTitle>Konto-Informationen</CardTitle>
          <CardDescription>Aus Ihrem Lexware Office Profil</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Unternehmensname', value: settings?.companyName },
            { label: 'USt-IdNr.', value: settings?.vatId ?? '—' },
            { label: 'Unternehmenstyp', value: settings?.businessType ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between border-b py-2 text-sm last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
