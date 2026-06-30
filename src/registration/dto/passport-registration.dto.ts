import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentEligibilityReason } from 'src/payment/payment-eligibility.service';

export class PassportTripDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() startDate: string;
  @ApiProperty() endDate: string;
  @ApiProperty() destination: string;
  @ApiProperty({ type: [String] }) images: string[];
}

export class PassportPaymentSummaryDto {
  @ApiProperty() price: number;
  @ApiProperty() discountApplied: number;
  @ApiProperty() paidAmount: number;
  @ApiProperty() amountDue: number;
  @ApiProperty() isFullyPaid: boolean;
}

export class PassportLatestPaymentDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['pendingApproval', 'approved', 'rejected'] })
  status: 'pendingApproval' | 'approved' | 'rejected';
  @ApiProperty() amount: number;
  @ApiProperty() submittedAt: string;
  @ApiPropertyOptional() rejectionMessage?: string;
}

export class PaymentEligibilityDto {
  @ApiProperty() allowed: boolean;
  @ApiPropertyOptional({
    enum: [
      'verification_required',
      'verification_pending',
      'verification_rejected',
      'payment_pending_approval',
      'no_balance_due',
      'waitlisted',
      'cancelled',
      'refund_locked',
      'registration_not_payable',
      'inconsistent_data',
    ],
  })
  reason: PaymentEligibilityReason | null;
}

export class PassportRegistrationDto {
  @ApiProperty() id: string;
  @ApiProperty({ type: PassportTripDto }) trip: PassportTripDto;
  @ApiProperty() registrationStatus: string;
  @ApiProperty() registeredAt: string;
  @ApiPropertyOptional() completedAt?: string;
  @ApiPropertyOptional() cancelledAt?: string;
  @ApiPropertyOptional() refundStatus?: string;
  @ApiPropertyOptional() rating?: number;
  @ApiProperty({ type: PassportPaymentSummaryDto })
  paymentSummary: PassportPaymentSummaryDto;
  @ApiProperty() hasApprovedPayment: boolean;
  @ApiProperty() hasPendingPayment: boolean;
  @ApiPropertyOptional({ type: PassportLatestPaymentDto, nullable: true })
  latestPayment: PassportLatestPaymentDto | null;
  @ApiProperty({ type: PaymentEligibilityDto })
  paymentEligibility: PaymentEligibilityDto;
  @ApiProperty() hasDetailedPlan: boolean;
  @ApiProperty() briefEligible: boolean;
}

export class PassportRegistrationsResponseDto {
  @ApiProperty({ type: [PassportRegistrationDto] })
  data: PassportRegistrationDto[];
}

export class RegistrationBriefDto {
  @ApiProperty() available: boolean;
  @ApiPropertyOptional() url?: string;
}
