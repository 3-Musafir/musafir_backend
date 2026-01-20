import {
  computeRefundQuote,
  REFUND_POLICY_LINK,
  REFUND_PROCESSING_FEE_PKR,
} from './refund-policy.util';

describe('computeRefundQuote', () => {
  const flagshipStartDate = new Date('2026-02-15T00:00:00+05:00');

  it('applies 100% for 15+ days before departure', () => {
    const submittedAt = new Date('2026-01-31T10:00:00+05:00'); // 15 days before (PKT)
    const quote = computeRefundQuote({
      flagshipStartDate,
      submittedAt,
      amountPaid: 10000,
    });

    expect(quote.daysBeforeDeparture).toBe(15);
    expect(quote.refundPercent).toBe(100);
    expect(quote.tierLabel).toBe('15+ days');
    expect(quote.processingFee).toBe(REFUND_PROCESSING_FEE_PKR);
    expect(quote.refundAmount).toBe(9500);
    expect(quote.policyLink).toBe(REFUND_POLICY_LINK);
  });

  it('applies 50% for 10-14 days before departure (inclusive)', () => {
    const submittedAt = new Date('2026-02-05T10:00:00+05:00'); // 10 days before
    const quote = computeRefundQuote({
      flagshipStartDate,
      submittedAt,
      amountPaid: 10000,
    });

    expect(quote.daysBeforeDeparture).toBe(10);
    expect(quote.refundPercent).toBe(50);
    expect(quote.tierLabel).toBe('10-14 days');
    expect(quote.refundAmount).toBe(4500);
  });

  it('applies 30% for 5-9 days before departure (inclusive)', () => {
    const submittedAt = new Date('2026-02-10T10:00:00+05:00'); // 5 days before
    const quote = computeRefundQuote({
      flagshipStartDate,
      submittedAt,
      amountPaid: 10000,
    });

    expect(quote.daysBeforeDeparture).toBe(5);
    expect(quote.refundPercent).toBe(30);
    expect(quote.tierLabel).toBe('5-9 days');
    expect(quote.refundAmount).toBe(2500);
  });

  it('applies 0% for 0-4 days before departure (inclusive)', () => {
    const submittedAt = new Date('2026-02-11T10:00:00+05:00'); // 4 days before
    const quote = computeRefundQuote({
      flagshipStartDate,
      submittedAt,
      amountPaid: 10000,
    });

    expect(quote.daysBeforeDeparture).toBe(4);
    expect(quote.refundPercent).toBe(0);
    expect(quote.tierLabel).toBe('0-4 days');
    expect(quote.refundAmount).toBe(0);
  });

  it('never returns a negative refund amount', () => {
    const submittedAt = new Date('2026-01-31T10:00:00+05:00'); // 15+ days
    const quote = computeRefundQuote({
      flagshipStartDate,
      submittedAt,
      amountPaid: 200,
    });

    expect(quote.refundPercent).toBe(100);
    expect(quote.refundAmount).toBe(0);
  });
});

