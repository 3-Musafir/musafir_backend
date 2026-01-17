import { Schema } from 'mongoose';

function transformValue(doc, ret: { [key: string]: any }) {
  delete ret.password;
  delete ret.__v;
  return ret;
}

export const RegistrationSchema = new Schema(
  {
    flagshipId: { type: Schema.Types.ObjectId, ref: 'Flagship', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    flagship: { type: Schema.Types.ObjectId, ref: 'Flagship', required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, default: null },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, default: null },
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
    status: { type: String, required: false, default: "pending" },
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
