import { Schema } from 'mongoose';
import { Document, Types } from 'mongoose';

export interface Refund extends Document {
  registration: Types.ObjectId;
  bankDetails: string;
  reason: string;
  feedback: string;
  rating: number;
  status: 'pending' | 'cleared' | 'rejected';
  amountPaid?: number;
  refundPercent?: number;
  processingFee?: number;
  refundAmount?: number;
  tierLabel?: string;
  policyLink?: string;
  policyAppliedAt?: Date;
}

export const RefundSchema = new Schema<Refund>(
  {
    registration: {
      type: Schema.Types.ObjectId,
      ref: 'Registration',
      required: true,
    },
    bankDetails: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    feedback: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'cleared', 'rejected'],
      default: 'pending',
    },
    amountPaid: { type: Number, required: false },
    refundPercent: { type: Number, required: false },
    processingFee: { type: Number, required: false },
    refundAmount: { type: Number, required: false },
    tierLabel: { type: String, required: false },
    policyLink: { type: String, required: false },
    policyAppliedAt: { type: Date, required: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);
