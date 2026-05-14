'use client';

import { useState } from 'react';
import type { ClarificationSession } from '@/app/lib/db';

interface Props {
  exceptionId: string;
  session: ClarificationSession;
  referenceDocs: string[];
}

export default function ClarificationCard({ exceptionId, session, referenceDocs }: Props) {
  const [answer, setAnswer] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(session.status === 'answered');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/exceptions/${exceptionId}/answer`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(window as any).__DASHBOARD_SECRET__ ?? ''}`,
        },
        body: JSON.stringify({ sessionId: session.id, answer }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/exceptions/${exceptionId}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(window as any).__DASHBOARD_SECRET__ ?? ''}`,
        },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      setUploadedFiles((prev) => [...prev, file.name]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`rounded-lg border p-4 ${submitted ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-sm font-medium text-gray-800">{session.question}</p>

      {submitted ? (
        <div className="mt-3 flex items-start gap-2 text-sm text-green-700">
          <span>✓</span>
          <span>{session.answer ?? answer}</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here…"
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {referenceDocs.length > 0 && (
            <div className="rounded-md border border-dashed border-gray-300 p-3">
              <p className="text-xs font-medium text-gray-600 mb-2">
                Reference document needed:
              </p>
              {referenceDocs.map((doc) => (
                <p key={doc} className="text-xs text-gray-500">• {doc}</p>
              ))}
              <div className="mt-2 flex items-center gap-2">
                <label className="cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  {uploading ? 'Uploading…' : 'Upload PDF'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
                {uploadedFiles.map((f) => (
                  <span key={f} className="text-xs text-green-600">✓ {f}</span>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !answer.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Answer'}
          </button>
        </form>
      )}
    </div>
  );
}
