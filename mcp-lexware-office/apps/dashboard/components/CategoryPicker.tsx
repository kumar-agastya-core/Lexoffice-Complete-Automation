'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: string;
  name: string;
  type: string;
}

interface Props {
  exceptionId: string;
  sessionId: string;
  onSelected?: (categoryId: string, categoryName: string) => void;
}

export default function CategoryPicker({ exceptionId, sessionId, onSelected }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/categories', {
      headers: { Authorization: `Bearer ${(window as any).__DASHBOARD_SECRET__ ?? ''}` },
    })
      .then((r) => r.json())
      .then((data: Category[]) => setCategories(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    const cat = categories.find((c) => c.id === selected);
    if (!cat) return;
    setSaving(true);
    try {
      await fetch(`/api/exceptions/${exceptionId}/category`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(window as any).__DASHBOARD_SECRET__ ?? ''}`,
        },
        body: JSON.stringify({ sessionId, categoryId: cat.id, categoryName: cat.name }),
      });
      setSaved(true);
      onSelected?.(cat.id, cat.name);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (saved) return <p className="text-sm text-green-700">✓ Category saved</p>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={loading}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">{loading ? 'Loading…' : 'Select category'}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.type})
          </option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={!selected || saving}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
