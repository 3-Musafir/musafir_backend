import { Schema } from 'mongoose';
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
      enum: [
        'bank_transfer',
        'wallet_only',
        'wallet_plus_bank',
        'cash',
        'split_cash_bank',
        'partial_cash',
      ],
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
    walletDebitId: {
      type: String,
      default: '',
    },
    cashAmount: {
      type: Number,
      default: 0,
    },
    bankAmount: {
      type: Number,
      default: 0,
    },
    cashProofKey: {
      type: String,
      default: '',
    },
    bankProofKey: {
      type: String,
      default: '',
    },
    createdByAdmin: {
      type: Boolean,
      default: false,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    recordedAt: {
      type: Date,
      required: false,
    },
    idempotencyKey: {
      type: String,
      default: '',
    },
    adminNote: {
      type: String,
      default: '',
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
    rejectionCode: { type: String, required: false },
    rejectionLabel: { type: String, required: false },
    rejectionPublicNote: { type: String, required: false },
    rejectionInternalNote: { type: String, required: false },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    reviewedAt: { type: Date, required: false },
    resubmissionOf: { type: Schema.Types.ObjectId, ref: 'Payment', required: false },
    resubmissionRoot: { type: Schema.Types.ObjectId, ref: 'Payment', required: false },
    resubmissionCount: { type: Number, required: false, default: 0 },
    remainingDueAtDecision: { type: Number, required: false },
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
PaymentSchema.index({ resubmissionRoot: 1, createdAt: -1 });
PaymentSchema.index({ resubmissionOf: 1 });
