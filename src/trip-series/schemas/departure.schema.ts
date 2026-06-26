import { Schema, Types } from 'mongoose';

function transformValue(doc, ret: { [key: string]: any }) {
  delete ret.__v;
  return ret;
}

const LocationSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: String, required: true, default: '0' },
    enabled: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const TierSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: String, required: true, default: '0' },
  },
  { _id: false },
);

const RoomOptionSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: String, required: true, default: '0' },
  },
  { _id: false },
);

const PaymentRulesSchema = new Schema(
  {
    depositAmount: { type: Number, required: false, default: 0 },
    partialPaymentPercent: { type: Number, required: false, default: 30 },
    paymentDeadline: { type: Date, required: false },
  },
  { _id: false },
);

const DiscountBucketSchema = new Schema(
  {
    enabled: { type: Boolean, required: false, default: false },
    amount: { type: String, required: false },
    value: { type: String, required: false },
    budget: { type: String, required: false },
    count: { type: String, required: false },
    deadline: { type: Date, required: false },
    usedValue: { type: Number, required: false, default: 0 },
    usedCount: { type: Number, required: false, default: 0 },
  },
  { _id: false },
);

const DiscountsSchema = new Schema(
  {
    totalDiscountsValue: { type: String, required: false },
    soloFemale: { type: DiscountBucketSchema, required: false },
    group: { type: DiscountBucketSchema, required: false },
    musafir: { type: DiscountBucketSchema, required: false },
  },
  { _id: false },
);

const HotelSchema = new Schema(
  {
    name: { type: String, required: false },
    city: { type: String, required: false },
    notes: { type: String, required: false },
  },
  { _id: false },
);

export const DepartureSchema = new Schema(
  {
    tripSeriesId: { type: Schema.Types.ObjectId, ref: 'TripSeries', required: true, index: true },
    legacyFlagshipId: { type: Schema.Types.ObjectId, ref: 'Flagship', required: false, index: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    durationDays: { type: Number, required: false },
    durationNights: { type: Number, required: false },
    departureCities: { type: [LocationSchema], required: false, default: [] },
    basePrice: { type: String, required: false },
    earlyBirdPrice: { type: Number, required: false },
    earlyBirdDeadline: { type: Date, required: false },
    tiers: { type: [TierSchema], required: false, default: [] },
    mattressTiers: { type: [TierSchema], required: false, default: [] },
    roomSharingPreference: { type: [RoomOptionSchema], required: false, default: [] },
    totalCapacity: { type: Number, required: false, default: 0 },
    femaleCapacity: { type: Number, required: false, default: 0 },
    maleCapacity: { type: Number, required: false, default: 0 },
    confirmedFemaleCount: { type: Number, required: false, default: 0 },
    confirmedMaleCount: { type: Number, required: false, default: 0 },
    waitlistedFemaleCount: { type: Number, required: false, default: 0 },
    waitlistedMaleCount: { type: Number, required: false, default: 0 },
    citySeats: { type: Object, required: false },
    bedSeats: { type: Number, required: false },
    mattressSeats: { type: Number, required: false },
    genderSplitEnabled: { type: Boolean, required: false, default: false },
    citySplitEnabled: { type: Boolean, required: false, default: false },
    mattressSplitEnabled: { type: Boolean, required: false, default: false },
    mattressPriceDelta: { type: Number, required: false },
    paymentRules: { type: PaymentRulesSchema, required: false },
    discounts: { type: DiscountsSchema, required: false },
    selectedBank: { type: String, required: false },
    flightIncluded: { type: Boolean, required: false, default: false },
    visaIncluded: { type: Boolean, required: false, default: false },
    landOnly: { type: Boolean, required: false, default: true },
    captain: { type: String, required: false },
    hotels: { type: [HotelSchema], required: false, default: [] },
    itineraryOverrides: { type: [Object], required: false, default: [] },
    inclusionsOverrides: { type: [Object], required: false, default: [] },
    bookingFormUrl: { type: String, required: false },
    whatsappGroupLink: { type: String, required: false },
    labels: { type: [String], required: false, default: [] },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'open', 'filling_fast', 'sold_out', 'waitlist', 'completed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    visibility: {
      type: String,
      required: true,
      enum: ['public', 'private'],
      default: 'private',
      index: true,
    },
    hiddenBySeries: { type: Boolean, required: false, default: false, index: true },
    registrationDeadline: { type: Date, required: false },
    advancePaymentDeadline: { type: Date, required: false },
    cancellationDeadline: { type: Date, required: false },
    adminNotes: { type: String, required: false },
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

DepartureSchema.index({ tripSeriesId: 1, startDate: 1 });
DepartureSchema.index({ visibility: 1, status: 1, startDate: 1 });
