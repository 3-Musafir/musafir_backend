import { Injectable } from '@nestjs/common';
import { RegistrationStatus } from 'src/constants/registration-status.enum';
import { VerificationStatus } from 'src/constants/verification-status.enum';

export type PaymentEligibilityReason =
  | 'verification_required'
  | 'verification_pending'
  | 'verification_rejected'
  | 'payment_pending_approval'
  | 'no_balance_due'
  | 'waitlisted'
  | 'cancelled'
  | 'refund_locked'
  | 'registration_not_payable'
  | 'inconsistent_data';

export interface PaymentEligibilityResult {
  allowed: boolean;
  reason: PaymentEligibilityReason | null;
}

export interface PaymentEligibilityFacts {
  registrationStatus?: string | null;
  verificationStatus?: string | null;
  amountDue?: number | null;
  hasPendingPayment?: boolean;
  cancelledAt?: Date | string | null;
  refundStatus?: string | null;
}

const PAYABLE_STATUSES = new Set<string>([
  RegistrationStatus.PAYMENT,
  RegistrationStatus.CONFIRMED,
]);

@Injectable()
export class PaymentEligibilityService {
  evaluate(facts: PaymentEligibilityFacts): PaymentEligibilityResult {
    if (facts.cancelledAt) return { allowed: false, reason: 'cancelled' };

    if (['pending', 'processing', 'refunded'].includes(String(facts.refundStatus || 'none'))) {
      return { allowed: false, reason: 'refund_locked' };
    }

    if (facts.registrationStatus === RegistrationStatus.WAITLISTED) {
      return { allowed: false, reason: 'waitlisted' };
    }

    if (typeof facts.amountDue !== 'number' || !Number.isFinite(facts.amountDue)) {
      return { allowed: false, reason: 'inconsistent_data' };
    }

    if (facts.amountDue <= 0) return { allowed: false, reason: 'no_balance_due' };
    if (facts.hasPendingPayment) {
      return { allowed: false, reason: 'payment_pending_approval' };
    }

    switch (facts.verificationStatus) {
      case VerificationStatus.PENDING:
        return { allowed: false, reason: 'verification_pending' };
      case VerificationStatus.REJECTED:
        return { allowed: false, reason: 'verification_rejected' };
      case VerificationStatus.VERIFIED:
        break;
      default:
        return { allowed: false, reason: 'verification_required' };
    }

    if (!facts.registrationStatus || !PAYABLE_STATUSES.has(facts.registrationStatus)) {
      return { allowed: false, reason: 'registration_not_payable' };
    }

    return { allowed: true, reason: null };
  }
}

export const PAYMENT_ELIGIBILITY_MESSAGES: Record<PaymentEligibilityReason, string> = {
  verification_required: 'Identity verification is required before making a payment.',
  verification_pending: 'Identity verification is pending. Please wait for approval before making a payment.',
  verification_rejected: 'Identity verification was not approved. Please re-apply before making a payment.',
  payment_pending_approval: 'A payment is already awaiting approval.',
  no_balance_due: 'No payment is due for this registration.',
  waitlisted: 'You are currently waitlisted. You will be notified when a seat opens.',
  cancelled: 'Cancelled registrations cannot accept payments.',
  refund_locked: 'Refunded or refunding registrations cannot accept payments.',
  registration_not_payable: 'Registration is not eligible for payment yet.',
  inconsistent_data: 'Payment details are temporarily unavailable.',
};
