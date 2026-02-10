import { Schema } from 'mongoose';
import { PaymentRejectionReason } from '../interface/payment-rejection-reason.interface';

export const PaymentRejectionReasonSchema = new Schema<PaymentRejectionReason>(
  {
    code: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    userMessage: { type: String, required: false },
    active: { type: Boolean, required: true, default: true },
    order: { type: Number, required: false, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

PaymentRejectionReasonSchema.index({ active: 1, order: 1 });
