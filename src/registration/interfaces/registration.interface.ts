import { Flagship } from "src/flagship/interfaces/flagship.interface";
import { Payment } from "src/payment/interface/payment.interface";
import { Rating } from "src/Rating/interfaces/rating.interface";
import { User } from "src/user/interfaces/user.interface";

export interface RegistrationLinkedContact {
  email: string;
  status: 'linked' | 'pending' | 'invited' | 'conflict';
  conflictReason?: string;
  userId?: string | User;
  registrationId?: string | Registration;
  invitedAt?: Date;
  linkedAt?: Date;
}

export class Registration {
  readonly _id: string;
  legacyRegistrationKey?: string;
  readonly flagshipId: string | Flagship;
  readonly userId: string;
  userGender?: 'male' | 'female' | 'other';
  readonly user: User;
  readonly flagship: Flagship;
  readonly paymentId?: string;
  readonly payment?: Payment;
  readonly latestPaymentId?: string;
  readonly latestPaymentStatus?: 'pendingApproval' | 'approved' | 'rejected' | 'none';
  readonly latestPaymentCreatedAt?: Date;
  readonly latestPaymentType?: string;
  readonly lastPaymentReminderAt?: Date;
  readonly isPaid?: boolean;
  readonly settlementStatus?: 'unpaid' | 'partial' | 'paid' | 'cancelled' | 'refunded';
  readonly hasApprovedPayment?: boolean;
  readonly attendanceStatus?: 'unknown' | 'present' | 'absent';
  readonly attendanceMarkedBy?: string | User;
  readonly attendanceMarkedAt?: Date;
  readonly attendanceSource?: string;
  readonly paymentDeferredAt?: Date;
  readonly paymentDeferredBy?: string | User;
  readonly joiningFromCity?: string;
  readonly tier?: string;
  readonly bedPreference?: string;
  readonly roomSharing?: string;
  readonly groupMembers?: string[];
  readonly groupId?: string;
  readonly groupDiscountStatus?: 'applied' | 'not_eligible' | 'budget_exhausted' | 'disabled';
  readonly linkedContacts?: RegistrationLinkedContact[];
  readonly expectations?: string;
  readonly tripType?: string;
  readonly price: number;
  readonly amountDue: number;
  waitlistAt?: Date;
  waitlistOfferSentAt?: Date;
  waitlistOfferAcceptedAt?: Date;
  waitlistOfferExpiresAt?: Date;
  waitlistOfferStatus?: 'none' | 'offered' | 'accepted' | 'expired';
  waitlistOfferResponse?: 'accepted' | 'declined';
  seatLocked?: boolean;
  seatLockedAt?: Date;
  cancelledAt?: Date;
  refundStatus?: 'none' | 'pending' | 'processing' | 'refunded' | 'rejected';
  completedAt?: Date;
  readonly walletPaid?: number;
  readonly discountApplied?: number;
  readonly discountType?: 'soloFemale' | 'group' | 'musafir';
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  ratingId?: string | Rating;
  status:
    | 'new'
    | 'waitlisted'
    | 'onboarding'
    | 'payment'
    | 'confirmed';
  comment: string;
}
