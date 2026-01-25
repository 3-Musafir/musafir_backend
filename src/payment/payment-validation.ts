import { BadRequestException } from '@nestjs/common';
import { User } from 'src/user/interfaces/user.interface';
import { VerificationStatus } from 'src/constants/verification-status.enum';

export function ensureUserVerifiedForPayment(user: User) {
  if (!user) {
    throw new BadRequestException({
      message: 'User information is required to process payment.',
      code: 'payment_user_missing',
    });
  }
  const status = (user as any)?.verification?.status;
  if (status === VerificationStatus.VERIFIED) return;
  if (status === VerificationStatus.PENDING) {
    throw new BadRequestException({
      message: 'Verification is pending. Please wait for approval before making a payment.',
      code: 'verification_pending',
    });
  }
  if (status === VerificationStatus.REJECTED) {
    throw new BadRequestException({
      message: 'Verification was rejected. Please re-apply before making a payment.',
      code: 'verification_rejected',
    });
  }
  throw new BadRequestException({
    message: 'Verification required before making a payment.',
    code: 'verification_required',
  });
}
