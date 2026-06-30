import { PaymentEligibilityService } from './payment-eligibility.service';

describe('PaymentEligibilityService', () => {
  const service = new PaymentEligibilityService();
  const payable = {
    registrationStatus: 'payment',
    verificationStatus: 'verified',
    amountDue: 1000,
    hasPendingPayment: false,
    refundStatus: 'none',
  };

  it('allows a verified payable registration', () => {
    expect(service.evaluate(payable)).toEqual({ allowed: true, reason: null });
  });

  it('blocks a pending payment before offering another action', () => {
    expect(service.evaluate({ ...payable, hasPendingPayment: true })).toEqual({
      allowed: false,
      reason: 'payment_pending_approval',
    });
  });

  it.each([
    ['pending', 'verification_pending'],
    ['rejected', 'verification_rejected'],
    ['unverified', 'verification_required'],
  ])('maps identity status %s to %s', (verificationStatus, reason) => {
    expect(service.evaluate({ ...payable, verificationStatus })).toEqual({
      allowed: false,
      reason,
    });
  });

  it('does not infer a zero balance from missing data', () => {
    expect(service.evaluate({ ...payable, amountDue: null })).toEqual({
      allowed: false,
      reason: 'inconsistent_data',
    });
  });
});
