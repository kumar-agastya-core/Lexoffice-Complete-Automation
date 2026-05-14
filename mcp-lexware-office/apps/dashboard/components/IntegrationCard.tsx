'use client';

import { useState, useRef } from 'react';

interface UploadResult {
  queued?: number;
  hasLoan?: boolean;
  period?: string;
  kassenbuchEntries?: number;
  error?: string;
}

type IntegrationType = 'sumup' | 'hellocash';

interface Props {
  title: string;
  description: string;
  uploadUrl: string;
  accept: string;
  integrationType: IntegrationType;
}

function formatSuccess(type: IntegrationType, r: UploadResult): string {
  const base = `Queued ${r.queued ?? 0} vouchers. Period: ${r.period ?? '—'}.`;
  if (type === 'sumup') {
    return r.hasLoan ? `${base} ⚠ Loan repayment detected — check Exception Tray.` : base;
  }
  const kb = r.kassenbuchEntries ?? 0;
  return kb > 0 ? `${base} ${kb} Kassenbuch entries need manual entry in Lexware.` : base;
}

export default function IntegrationCard({ title, description, uploadUrl, accept, integrationType }: Props) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setResult(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(window as any).__DASHBOARD_SECRET__ ?? ''}`,
        },
        body: fd,
      });
      const data = await res.json() as UploadResult;
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mb-4 text-sm text-gray-500">{description}</p>

      {result ? (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          <p className="font-medium">✓ Upload complete</p>
          <p className="mt-1">{formatSuccess(integrationType, result)}</p>
          <button
            onClick={() => setResult(null)}
            className="mt-2 text-xs text-green-700 hover:underline"
          >
            Upload another
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-8 transition-colors hover:border-blue-400 hover:bg-blue-50"
        >
          <p className="text-sm font-medium text-gray-600">
            {uploading ? 'Processing…' : 'Drop file here or click to browse'}
          </p>
          <p className="mt-1 text-xs text-gray-400">{accept}</p>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
