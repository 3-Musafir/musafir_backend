import { Schema } from 'mongoose';
import { WALLET_CURRENCY } from '../wallet.constants';

export type WalletTransactionDirection = 'credit' | 'debit';

export const WalletTransactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    currency: { type: String, required: true, default: WALLET_CURRENCY },
    direction: { type: String, required: true, enum: ['credit', 'debit'] },
    amount: { type: Number, required: true, min: 1 },
    type: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['posted', 'void'],
      default: 'posted',
    },
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true },
    balanceAfter: { type: Number, required: true },
    expiresAt: { type: Date, required: false },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    note: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, required: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
WalletTransactionSchema.index({ userId: 1, status: 1, expiresAt: 1 });
WalletTransactionSchema.index(
  { type: 1, 'metadata.sourceId': 1 },
  { unique: true, sparse: true },
);
