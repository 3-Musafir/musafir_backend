import { Schema } from 'mongoose';
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
  screenshot: string;
  status: 'pendingApproval' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const PaymentSchema = new Schema<Payment>(
  {
    registration: {
      type: Schema.Types.ObjectId,
      ref: 'Registration',
      required: true,
    },
    bankAccount: {
      type: Schema.Types.ObjectId,
      ref: 'BankAccount',
      required: false,
    },
    bankAccountLabel: {
      type: String,
      default: '',
    },
    paymentType: {
      type: String,
      enum: ['fullPayment', 'partialPayment'],
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'wallet_only', 'wallet_plus_bank'],
      default: 'bank_transfer',
    },
    amount: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    walletRequested: {
      type: Number,
      default: 0,
    },
    walletApplied: {
      type: Number,
      default: 0,
    },
    screenshot: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ['pendingApproval', 'approved', 'rejected'],
      default: 'pendingApproval',
    },
    rejectionReason: { type: String, required: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

PaymentSchema.virtual('userDetails', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true,
});

PaymentSchema.index({ registration: 1, status: 1, createdAt: -1 });
