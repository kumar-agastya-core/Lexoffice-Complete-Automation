interface VoucherPreview {
  description?: string;
  suggestedVoucherType?: string;
  type?: string;
  extractedAmount?: number;
  amount?: number;
  taxType?: string;
  category?: string;
  pendingTriggers?: string[];
}

interface ExecutionPlan {
  suggestedVoucherType?: string;
  extractedAmount?: number;
  extractedDate?: string;
  invoiceNumber?: string;
  vatId?: string;
  pendingTriggers?: string[];
  vouchers?: VoucherPreview[];
}

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  return `€${Number(n).toFixed(2)}`;
}

export default function ExecutionPlanPreview({ plan }: { plan: unknown }) {
  const p = plan as ExecutionPlan;
  const vouchers = p.vouchers ?? [
    {
      description: p.suggestedVoucherType ?? 'Purchase Invoice',
      suggestedVoucherType: p.suggestedVoucherType,
      extractedAmount: p.extractedAmount,
    },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">
        WHAT WILL BE CREATED:
      </p>
      <div className="space-y-3">
        {vouchers.map((v, i) => (
          <div key={i} className="border-t border-gray-200 pt-3 first:border-0 first:pt-0">
            <p className="font-semibold text-gray-800">
              Voucher {i + 1}
              {v.description ? ` — ${v.description}` : ''}
            </p>
            <div className="mt-1 space-y-0.5 text-gray-600">
              <p>Type: {v.suggestedVoucherType ?? v.type ?? '—'}</p>
              <p>Amount: {fmt(v.extractedAmount ?? v.amount)}</p>
              {v.taxType && <p>Tax: {v.taxType}</p>}
              {v.category && <p>Category: {v.category}</p>}
            </div>
          </div>
        ))}
      </div>
      {p.pendingTriggers && p.pendingTriggers.length > 0 && (
        <p className="mt-3 border-t border-gray-200 pt-3 text-amber-700">
          ⚠ Pending: {p.pendingTriggers.join(', ')}
        </p>
      )}
      {(p.extractedDate || p.invoiceNumber) && (
        <div className="mt-3 border-t border-gray-200 pt-3 text-gray-500">
          {p.invoiceNumber && <p>Invoice: {p.invoiceNumber}</p>}
          {p.extractedDate && <p>Date: {p.extractedDate}</p>}
          {p.vatId && <p>VAT ID: {p.vatId}</p>}
        </div>
      )}
    </div>
  );
}
