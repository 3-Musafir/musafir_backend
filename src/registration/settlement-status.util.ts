export type SettlementStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled' | 'refunded';

export function computeSettlementStatus(input: {
  amountDue?: number | null;
  hasApprovedPayment?: boolean | null;
  cancelledAt?: Date | string | null;
  refundStatus?: string | null;
}): SettlementStatus {
  const refundStatus = String(input?.refundStatus || '').toLowerCase();
  if (refundStatus === 'refunded') {
    return 'refunded';
  }
  if (input?.cancelledAt) {
    return 'cancelled';
  }
  const amountDue = Math.max(0, Math.floor(Number(input?.amountDue) || 0));
  if (amountDue === 0) {
    return 'paid';
  }
  if (input?.hasApprovedPayment) {
    return 'partial';
  }
  return 'unpaid';
}
