import { Schema } from 'mongoose';
import { WALLET_CURRENCY } from '../wallet.constants';

export const WalletBalanceSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    currency: { type: String, required: true, default: WALLET_CURRENCY },
    balance: { type: Number, required: true, default: 0 },
    updatedAt: { type: Date, required: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

WalletBalanceSchema.index({ userId: 1 }, { unique: true });

