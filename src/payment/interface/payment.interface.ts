import { User } from 'src/user/interfaces/user.interface';
import { Document, Types } from 'mongoose';

export interface Payment extends Document {
  bankAccount: Types.ObjectId;
  registration: Types.ObjectId;
  paymentType: 'fullPayment' | 'partialPayment';
  amount: number;
  discount?: number;
  screenshot: string;
  status: 'pendingApproval' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  IBAN: string;
}
