'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

const AUTH = `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? ''}`;

export function ActiveClientBanner({ clientName }: { clientName: string }) {
  const router = useRouter();

  async function clearActive() {
    await fetch('/api/mandanten/clear-active', {
      method: 'POST',
      headers: { Authorization: AUTH },
    });
    router.refresh();
  }

  return (
    <div className="rounded-md border border-orange-300 bg-orange-50 p-2 dark:border-orange-700 dark:bg-orange-950">
      <p className="mb-1.5 text-xs font-medium text-orange-800 dark:text-orange-200">
        Aktiv: {clientName}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="h-6 w-full text-xs"
        onClick={() => void clearActive()}
      >
        Eigenes Konto
      </Button>
    </div>
  );
}
