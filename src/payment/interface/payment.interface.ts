import { User } from 'src/user/interfaces/user.interface';
import { Document, Types } from 'mongoose';

export interface Payment extends Document {
  bankAccount?: Types.ObjectId | null;
  bankAccountLabel?: string;
  registration: Types.ObjectId;
  paymentType: 'fullPayment' | 'partialPayment';
  paymentMethod?: 'bank_transfer' | 'wallet_only' | 'wallet_plus_bank';
  amount: number;
  discount?: number;
  walletRequested?: number;
  walletApplied?: number;
  walletDebitId?: string;
  screenshot: string;
  status: 'pendingApproval' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  IBAN: string;
}
