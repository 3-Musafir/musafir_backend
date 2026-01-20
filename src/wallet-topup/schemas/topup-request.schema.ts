import { Schema } from 'mongoose';
import { WALLET_TOPUP_PACKAGES_PKR, WALLET_TOPUP_WHATSAPP_NUMBER } from 'src/wallet/wallet.constants';

export const TopupRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageAmount: {
      type: Number,
      required: true,
      enum: [...WALLET_TOPUP_PACKAGES_PKR],
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processed', 'rejected'],
      default: 'pending',
      index: true,
    },
    whatsappTo: { type: String, required: true, default: WALLET_TOPUP_WHATSAPP_NUMBER },
    messageTemplate: { type: String, required: true },
    processedAt: { type: Date, required: false },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true, versionKey: false },
);

TopupRequestSchema.index({ status: 1, createdAt: -1 });
TopupRequestSchema.index({ userId: 1, createdAt: -1 });

