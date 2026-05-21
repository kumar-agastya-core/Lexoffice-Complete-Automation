import { LexwareClient } from '@lexware/client';

interface VoucherRow {
  id: string;
  version: number;
  voucherStatus: string;
  voucherItems: Array<{ amount: number; taxAmount: number; taxRatePercent: number; categoryId?: string }>;
  [k: string]: unknown;
}

export async function approveVoucher(
  voucherId: string,
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  const client = new LexwareClient(apiKey);

  const voucher = await client.request<VoucherRow>(`/v1/vouchers/${voucherId}`);
  if (!voucher) return { success: false, error: 'Voucher not found' };

  const result = await client.writeRequest<VoucherRow>(`/v1/vouchers/${voucherId}`, 'PUT', {
    ...voucher,
    voucherStatus: 'open',
  });

  if (!result) return { success: false, error: 'No response from Lexware' };
  if (!result.ok) return { success: false, error: `Lexware error ${result.status}` };
  return { success: true };
}

interface PaymentStatus {
  openAmount: number;
  paymentStatus: string;
  voucherStatus: string;
  paidDate: string | null;
  paymentItems: Array<{ paymentItemType: string; amount: number; discountDate?: string }>;
}

export async function getPaymentStatus(
  voucherId: string,
  apiKey: string,
): Promise<PaymentStatus | null> {
  const client = new LexwareClient(apiKey);
  return client.request<PaymentStatus>(`/v1/payments/${voucherId}`);
}

export async function updateVoucherCategory(
  voucherId: string,
  categoryId: string,
  apiKey: string,
): Promise<void> {
  const client = new LexwareClient(apiKey);

  const voucher = await client.request<VoucherRow>(`/v1/vouchers/${voucherId}`);
  if (!voucher) throw new Error('Voucher not found');

  const updatedItems = voucher.voucherItems.map((item) => ({ ...item, categoryId }));

  const result = await client.writeRequest<VoucherRow>(`/v1/vouchers/${voucherId}`, 'PUT', {
    ...voucher,
    voucherItems: updatedItems,
  });

  if (!result?.ok) throw new Error(`Failed to update voucher category: ${result?.status}`);
}
