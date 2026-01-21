import { Schema } from 'mongoose';

export const RefundSettlementSchema = new Schema(
  {
    refundId: { type: Schema.Types.ObjectId, ref: 'Refund', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    method: {
      type: String,
      required: true,
      enum: ['wallet_credit', 'bank_refund'],
      default: 'wallet_credit',
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'posted', 'void'],
      default: 'pending',
      index: true,
    },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    postedAt: { type: Date, required: false },
    metadata: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true, versionKey: false },
);

RefundSettlementSchema.index({ refundId: 1, method: 1 }, { unique: true });
RefundSettlementSchema.index({ status: 1, createdAt: -1 });
RefundSettlementSchema.index({ userId: 1, createdAt: -1 });
