import { Schema } from 'mongoose';

export const GoogleSheetRowSchema = new Schema(
  {
    flagshipId: { type: Schema.Types.ObjectId, ref: 'Flagship', required: true },
    rowType: {
      type: String,
      enum: ['registration', 'payment'],
      required: true,
    },
    payload: { type: Schema.Types.Mixed, required: true },
    syncedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);
