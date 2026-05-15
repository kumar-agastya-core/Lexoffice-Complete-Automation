'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

const useSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

interface SecretFormValues { secret: string }
interface SupabaseFormValues { email: string; password: string }

function SecretLogin() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit } = useForm<SecretFormValues>({ defaultValues: { secret: '' } });

  async function onSubmit(values: SecretFormValues) {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: values.secret }),
      });
      if (res.ok) router.push('/upload');
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anmelden</CardTitle>
        <CardDescription>Geben Sie Ihren Zugangscode ein</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <Input type="password" placeholder="Zugangscode" {...register('secret')} />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>Ungültiger Zugangscode</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? 'Wird geprüft…' : 'Anmelden'}
          </Button>
        </form>
      </CardContent>
      <CardFooter />
    </Card>
  );
}

function SupabaseLogin() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit } = useForm<SupabaseFormValues>({
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: SupabaseFormValues) {
    setLoading(true);
    setError('');
    try {
      const { createClient } = await import('@/app/lib/supabase/client');
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (authError) {
        setError(authError.message);
      } else {
        router.push('/upload');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anmelden</CardTitle>
        <CardDescription>Mit Ihrem Konto anmelden</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="space-y-1">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" placeholder="name@firma.de" {...register('email')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Passwort</Label>
            <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? 'Wird geprüft…' : 'Anmelden'}
          </Button>
        </form>
      </CardContent>
      <CardFooter />
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold">Lexware AI</h1>
        {useSupabase ? <SupabaseLogin /> : <SecretLogin />}
      </div>
    </div>
  );
}
