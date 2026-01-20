import { Document, Types } from 'mongoose';

export interface WalletBalance extends Document {
  userId: Types.ObjectId;
  currency: 'PKR';
  balance: number;
  updatedAt?: Date;
  createdAt: Date;
}

export type WalletTransactionDirection = 'credit' | 'debit';

export interface WalletTransaction extends Document {
  userId: Types.ObjectId;
  currency: 'PKR';
  direction: WalletTransactionDirection;
  amount: number;
  type: string;
  status: 'posted' | 'void';
  sourceType: string;
  sourceId: string;
  balanceAfter: number;
  expiresAt?: Date;
  postedBy?: Types.ObjectId;
  note?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
