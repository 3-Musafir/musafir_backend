import { Flagship } from "src/flagship/interfaces/flagship.interface";
import { Payment } from "src/payment/interface/payment.interface";
import { Rating } from "src/Rating/interfaces/rating.interface";
import { User } from "src/user/interfaces/user.interface";

export class Registration {
  readonly _id: string;
  legacyRegistrationKey?: string;
  readonly flagshipId: string | Flagship;
  readonly userId: string;
  readonly user: User;
  readonly flagship: Flagship;
  readonly paymentId?: string;
  readonly payment?: Payment;
  readonly isPaid?: boolean;
  readonly joiningFromCity?: string;
  readonly tier?: string;
  readonly bedPreference?: string;
  readonly roomSharing?: string;
  readonly groupMembers?: string[];
  readonly expectations?: string;
  readonly tripType?: string;
  readonly price: number;
  readonly amountDue: number;
  readonly walletPaid?: number;
  readonly discountApplied?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  ratingId?: string | Rating;
  status:
    | 'pending'
    | 'accepted'
    | 'confirmed'
    | 'rejected'
    | 'notReserved'
    | 'cancelled'
    | 'refundProcessing'
    | 'refunded'
    | 'completed'
    | 'didntPick';
  comment: string;
}
