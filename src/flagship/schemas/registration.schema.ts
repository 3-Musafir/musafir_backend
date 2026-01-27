import { Schema } from 'mongoose';

function transformValue(doc, ret: { [key: string]: any }) {
  delete ret.password;
  delete ret.__v;
  return ret;
}

export const RegistrationSchema = new Schema(
  {
    legacyRegistrationKey: { type: String, required: true, index: true, unique: true, sparse: true },
    flagshipId: { type: Schema.Types.ObjectId, ref: 'Flagship', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userGender: { type: String, required: false },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    flagship: { type: Schema.Types.ObjectId, ref: 'Flagship', required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, default: null },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, default: null },
    latestPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, default: null },
    latestPaymentStatus: {
      type: String,
      enum: ['pendingApproval', 'approved', 'rejected', 'none'],
      default: 'none',
    },
    latestPaymentCreatedAt: { type: Date, required: false },
    latestPaymentType: { type: String, required: false },
    lastPaymentReminderAt: { type: Date, required: false },
    isPaid: { type: Boolean, required: false, default: false },
    joiningFromCity: { type: String, required: false },
    tier: { type: String, required: false },
    bedPreference: { type: String, required: false },
    roomSharing: { type: String, required: false },
    groupMembers: { type: [String], required: false },
    expectations: { type: String, required: false },
    tripType: { type: String, required: false },
    price: { type: Number, required: false },
    amountDue: { type: Number, required: false },
    discountApplied: { type: Number, required: false, default: 0 },
    status: { type: String, required: false, default: 'new' },
    waitlistAt: { type: Date, required: false },
    waitlistOfferSentAt: { type: Date, required: false },
    waitlistOfferAcceptedAt: { type: Date, required: false },
    waitlistOfferExpiresAt: { type: Date, required: false },
    waitlistOfferStatus: { type: String, required: false, default: 'none' },
    waitlistOfferResponse: { type: String, required: false },
    seatLocked: { type: Boolean, required: false, default: false },
    seatLockedAt: { type: Date, required: false },
    cancelledAt: { type: Date, required: false },
    refundStatus: { type: String, required: false, default: 'none' },
    completedAt: { type: Date, required: false },
    ratingId: { type: Schema.Types.ObjectId, ref: 'Rating', required: false, default: null },
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

RegistrationSchema.index({ userId: 1, flagship: 1 });
RegistrationSchema.index({ flagship: 1, status: 1, waitlistAt: 1 });
