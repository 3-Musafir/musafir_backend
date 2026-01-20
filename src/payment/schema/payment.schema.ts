import { Schema } from 'mongoose';
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
      required: true,
    },
    paymentType: {
      type: String,
      enum: ['fullPayment', 'partialPayment'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    discount: {
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
