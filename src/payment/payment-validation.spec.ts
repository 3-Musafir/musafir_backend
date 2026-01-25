import { BadRequestException } from '@nestjs/common';
import { ensureUserVerifiedForPayment } from './payment-validation';
import { VerificationStatus } from 'src/constants/verification-status.enum';

describe('ensureUserVerifiedForPayment', () => {
  const baseUser = {
    _id: 'user1',
    verification: {},
  } as any;

  it('allows VERIFIED users', () => {
    expect(() =>
      ensureUserVerifiedForPayment({
        ...baseUser,
        verification: { status: VerificationStatus.VERIFIED },
      }),
    ).not.toThrow();
  });

  it('rejects UNVERIFIED users with verification_required', () => {
    expect(() =>
      ensureUserVerifiedForPayment({
        ...baseUser,
        verification: { status: VerificationStatus.UNVERIFIED },
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects PENDING users with verification_pending', () => {
    expect(() =>
      ensureUserVerifiedForPayment({
        ...baseUser,
        verification: { status: VerificationStatus.PENDING },
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects REJECTED users with verification_rejected', () => {
    expect(() =>
      ensureUserVerifiedForPayment({
        ...baseUser,
        verification: { status: VerificationStatus.REJECTED },
      }),
    ).toThrow(BadRequestException);
  });
});
