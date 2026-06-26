import { Schema } from 'mongoose';

function transformValue(doc, ret: { [key: string]: any }) {
  delete ret.__v;
  return ret;
}

const ReviewMediaSchema = new Schema(
  {
    url: { type: String, required: true },
    type: { type: String, required: false, enum: ['image', 'video'], default: 'image' },
    alt: { type: String, required: false },
  },
  { _id: false },
);

const ReviewAnswerSchema = new Schema(
  {
    questionId: { type: String, required: true },
    questionLabel: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    valueLabel: { type: String, required: false },
  },
  { _id: false },
);

const WhistleblowingSchema = new Schema(
  {
    category: { type: String, required: false },
    message: { type: String, required: false },
    contactConsent: { type: Boolean, required: false, default: false },
  },
  { _id: false },
);

const ReviewRewardSchema = new Schema(
  {
    amount: { type: Number, required: false, default: 0 },
    currency: { type: String, required: false, default: 'PKR' },
    transactionId: { type: String, required: false },
    creditedAt: { type: Date, required: false },
  },
  { _id: false },
);

export const TripSeriesReviewSchema = new Schema(
  {
    tripSeriesId: { type: Schema.Types.ObjectId, ref: 'TripSeries', required: true, index: true },
    departureId: { type: Schema.Types.ObjectId, ref: 'Departure', required: false, index: true },
    registrationId: { type: Schema.Types.ObjectId, ref: 'Registration', required: false },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    rating: { type: Number, required: true, min: 1, max: 5 },
    answers: { type: [ReviewAnswerSchema], required: false, default: [] },
    review: { type: String, required: false, default: '' },
    whistleblowing: { type: WhistleblowingSchema, required: false },
    media: { type: [ReviewMediaSchema], required: false, default: [] },
    helpfulCount: { type: Number, required: false, default: 0 },
    helpfulUserIds: [{ type: Schema.Types.ObjectId, ref: 'User', required: false }],
    reward: { type: ReviewRewardSchema, required: false },
    sourceType: {
      type: String,
      required: true,
      enum: ['registration', 'manual', 'imported'],
      default: 'manual',
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'published', 'hidden'],
      default: 'published',
      index: true,
    },
    featured: { type: Boolean, required: false, default: false },
  },
  {
    toJSON: {
      virtuals: true,
      transform: transformValue,
    },
    versionKey: false,
    timestamps: true,
  },
);

TripSeriesReviewSchema.index({ tripSeriesId: 1, status: 1, featured: -1, createdAt: -1 });
TripSeriesReviewSchema.index(
  { tripSeriesId: 1, departureId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      tripSeriesId: { $exists: true },
      departureId: { $exists: true },
      userId: { $exists: true },
    },
  },
);
