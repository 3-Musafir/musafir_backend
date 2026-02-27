import { User } from 'src/user/interfaces/user.interface';
import { Document, Types } from 'mongoose';

export interface Payment extends Document {
  bankAccount?: Types.ObjectId | null;
  bankAccountLabel?: string;
  registration: Types.ObjectId;
  paymentType: 'fullPayment' | 'partialPayment';
  paymentMethod?:
    | 'bank_transfer'
    | 'wallet_only'
    | 'wallet_plus_bank'
    | 'cash'
    | 'split_cash_bank'
    | 'partial_cash';
  amount: number;
  discount?: number;
  walletRequested?: number;
  walletApplied?: number;
  walletDebitId?: string;
  cashAmount?: number;
  bankAmount?: number;
  cashProofKey?: string;
  bankProofKey?: string;
  createdByAdmin?: boolean;
  recordedBy?: Types.ObjectId;
  recordedAt?: Date;
  idempotencyKey?: string;
  adminNote?: string;
  screenshot: string;
  status: 'pendingApproval' | 'approved' | 'rejected';
  rejectionCode?: string;
  rejectionLabel?: string;
  rejectionPublicNote?: string;
  rejectionInternalNote?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  resubmissionOf?: Types.ObjectId;
  resubmissionRoot?: Types.ObjectId;
  resubmissionCount?: number;
  remainingDueAtDecision?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  IBAN: string;
}
