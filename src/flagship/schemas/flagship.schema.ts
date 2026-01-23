import { Schema } from 'mongoose';

function transformValue(doc, ret: { [key: string]: any }) {
  delete ret.__v;
  return ret;
}

const LocationSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: String, required: true },
    enabled: { type: Boolean, required: true },
  },
  { _id: false }, // prevent generating an _id for subdocuments
);

const TierSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: String, required: true },
  },
  { _id: false },
);

const MattressTierSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: String, required: true },
  },
  { _id: false },
);

const RoomSharingPreferenceSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: String, required: true },
  },
  { _id: false },
);

const CitiesSeatSchema = new Schema(
  {
    city: { type: String, required: true },
    seats: { type: Number, required: true },
  },
  { _id: false },
);

// Sub-schema for discounts
const DiscountsSchema = new Schema(
  {
    totalDiscountsValue: { type: String, required: false },
    partialTeam: {
      enabled: { type: Boolean, required: false },
      amount: { type: String, required: false },
      count: { type: String, required: false },
    },
    soloFemale: {
      enabled: { type: Boolean, required: false },
      amount: { type: String, required: false },
      count: { type: String, required: false },
    },
    group: {
      enabled: { type: Boolean, required: false },
      value: { type: String, required: false },
      amount: { type: String, required: false },
      count: { type: String, required: false },
    },
    musafir: {
      enabled: { type: Boolean, required: false },
      budget: { type: String, required: false },
      count: { type: String, required: false },
    },
  },
  { _id: false },
);

export const FlagshipSchema = new Schema(
  {
    legacyFlagshipKey: { type: String, required: false, index: true, unique: true, sparse: true },
    tripName: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    category: {
      type: String,
      required: true,
      enum: ['detox', 'flagship', 'adventure', 'student'],
    },
    visibility: {
      type: String,
      required: true,
      enum: ['public', 'private'],
    },
    images: { type: [String], required: false },

    created_By: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    destination: {
      type: String,
      required: true,
    },
    days: {
      type: Number,
      required: false,
    },
    seats: {
      type: Number,
      required: false,
    },
    status: {
      type: String,
      required: false,
      enum: ['unpublished', 'published', 'completed'],
    },

    packages: { type: [Object], required: false },

    basePrice: { type: String, required: false },

    locations: { type: [LocationSchema], required: false },

    tiers: { type: [TierSchema], required: false },

    mattressTiers: { type: [MattressTierSchema], required: false },

    roomSharingPreference: { type: [RoomSharingPreferenceSchema], required: false },

    // New content fields
    travelPlan: { type: String, required: false },
    tocs: { type: String, required: false },
    files: {
      type: [
        {
          name: { type: String, required: false },
          size: { type: String, required: false },
        },
      ],
      required: false,
    },
    detailedPlan: { type: String, required: false },

    // Seats Allocation Fields
    totalSeats: { type: Number, required: false },
    femaleSeats: { type: Number, required: false },
    maleSeats: { type: Number, required: false },
    confirmedFemaleCount: { type: Number, required: false, default: 0 },
    confirmedMaleCount: { type: Number, required: false, default: 0 },
    waitlistedFemaleCount: { type: Number, required: false, default: 0 },
    waitlistedMaleCount: { type: Number, required: false, default: 0 },
    citySeats: { type: Object, required: false },
    bedSeats: { type: Number, required: false },
    mattressSeats: { type: Number, required: false },
    genderSplitEnabled: { type: Boolean, required: false, default: true },
    citySplitEnabled: { type: Boolean, required: false, default: true },
    mattressSplitEnabled: { type: Boolean, required: false, default: true },
    mattressPriceDelta: { type: Number, required: false },
    earlyBirdPrice: { type: Number, required: false },

    // New Discounts Fields
    discounts: { type: DiscountsSchema, required: false },

    // Important Dates
    tripDates: { type: String, required: false },
    registrationDeadline: { type: Date, required: false },
    advancePaymentDeadline: { type: Date, required: false },
    earlyBirdDeadline: { type: Date, required: false },

    // payment
    selectedBank: { type: String, required: false },

    // Flagship view status
    publish: { type: Boolean, required: false, default: false },
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

FlagshipSchema.virtual('createdBy', {
  justOne: true,
  localField: 'created_By',
  foreignField: '_id',
  ref: 'User',
});
