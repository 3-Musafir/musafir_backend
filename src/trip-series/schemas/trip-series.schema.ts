import { Schema, Types } from 'mongoose';

function transformValue(doc, ret: { [key: string]: any }) {
  delete ret.__v;
  return ret;
}

const MediaItemSchema = new Schema(
  {
    url: { type: String, required: true },
    title: { type: String, required: false },
    alt: { type: String, required: false },
    type: { type: String, required: false, enum: ['image', 'video'], default: 'image' },
  },
  { _id: false },
);

const VibeScoreSchema = new Schema(
  {
    label: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 5 },
  },
  { _id: false },
);

const ItineraryDaySchema = new Schema(
  {
    day: { type: Number, required: true },
    title: { type: String, required: true },
    summary: { type: String, required: false },
    image: { type: String, required: false },
    imageTitle: { type: String, required: false },
    imageAlt: { type: String, required: false },
    stay: { type: String, required: false },
  },
  { _id: false },
);

const RouteWaypointSchema = new Schema(
  {
    label: { type: String, required: true },
    description: { type: String, required: false },
  },
  { _id: false },
);

const DetailItemSchema = new Schema(
  {
    label: { type: String, required: true },
    detail: { type: String, required: false },
    icon: { type: String, required: false },
  },
  { _id: false },
);

const AdditionalInfoSchema = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
  },
  { _id: false },
);

const TripFaqSchema = new Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false },
);

const SeoSchema = new Schema(
  {
    title: { type: String, required: false },
    description: { type: String, required: false },
    keywords: { type: [String], required: false, default: [] },
    ogImage: { type: String, required: false },
    canonical: { type: String, required: false },
  },
  { _id: false },
);

export const TripSeriesSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    destination: { type: String, required: true, trim: true },
    country: { type: String, required: false, trim: true },
    region: { type: String, required: false, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['local', 'international', 'girls-first', 'romantic', 'corporate', 'custom', 'flagship', 'adventure', 'student', 'detox'],
      default: 'local',
      index: true,
    },
    tripTypes: { type: [String], required: false, default: [], index: true },
    mood: { type: [String], required: false, default: [] },
    audience: { type: [String], required: false, default: [] },
    heroMedia: { type: [MediaItemSchema], required: false, default: [] },
    gallery: { type: [MediaItemSchema], required: false, default: [] },
    images: { type: [String], required: false, default: [] },
    overview: { type: String, required: false },
    summary: { type: String, required: false },
    emotionalPositioning: { type: String, required: false },
    highlights: { type: [String], required: false, default: [] },
    itineraryDays: { type: [ItineraryDaySchema], required: false, default: [] },
    routeWaypoints: { type: [RouteWaypointSchema], required: false, default: [] },
    includedItems: { type: [DetailItemSchema], required: false, default: [] },
    notIncludedItems: { type: [DetailItemSchema], required: false, default: [] },
    optionalActivities: { type: [DetailItemSchema], required: false, default: [] },
    additionalInfo: { type: [AdditionalInfoSchema], required: false, default: [] },
    tripFaqs: { type: [TripFaqSchema], required: false, default: [] },
    safetyNotes: { type: String, required: false },
    communityNotes: { type: String, required: false },
    effortLevel: { type: String, required: false },
    difficulty: { type: String, required: false },
    vibeScores: { type: [VibeScoreSchema], required: false, default: [] },
    durationMin: { type: Number, required: false },
    durationMax: { type: Number, required: false },
    totalKilometers: { type: Number, required: false },
    estimatedStartingPrice: { type: Number, required: false },
    ratingAverage: { type: Number, required: false, default: 0 },
    ratingCount: { type: Number, required: false, default: 0 },
    seo: { type: SeoSchema, required: false },
    status: {
      type: String,
      required: true,
      enum: ['active', 'hidden', 'archived'],
      default: 'hidden',
      index: true,
    },
    relatedSeries: [{ type: Schema.Types.ObjectId, ref: 'TripSeries', required: false }],
    legacyFlagshipIds: [{ type: Schema.Types.ObjectId, ref: 'Flagship', required: false }],
    contentVersion: {
      type: String,
      required: true,
      default: () => new Types.ObjectId().toHexString(),
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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

TripSeriesSchema.index({ status: 1, category: 1, destination: 1 });
TripSeriesSchema.index({ title: 'text', destination: 'text', summary: 'text', overview: 'text' });
