import { Schema } from 'mongoose';

export const GoogleSheetCredentialSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    flagshipId: { type: Schema.Types.ObjectId, ref: 'Flagship', required: true },
    sheetId: { type: String, required: true },
    sheetName: { type: String, default: '' },
    status: {
      type: String,
      enum: ['connected', 'disconnected', 'error'],
      default: 'connected',
    },
    lastSyncedAt: { type: Date },
    syncError: { type: String, default: '' },
  },
  { timestamps: true },
);
