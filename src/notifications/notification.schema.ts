import { Schema } from 'mongoose';

function transformValue(doc, ret: { [key: string]: any }) {
  delete ret.__v;
  return ret;
}

export const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, required: true, default: 'general', index: true },
    link: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, required: false },
    readAt: { type: Date, required: false, default: null, index: true },
  },
  {
    toJSON: {
      virtuals: false,
      transform: transformValue,
    },
    versionKey: false,
    timestamps: true,
  },
);

NotificationSchema.index({ createdAt: -1 });
