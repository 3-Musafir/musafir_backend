import { Document, Types } from 'mongoose';

export interface RefundSettlement extends Document {
  refundId: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  method: 'wallet_credit';
  status: 'pending' | 'posted' | 'void';
  postedBy?: Types.ObjectId;
  postedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

