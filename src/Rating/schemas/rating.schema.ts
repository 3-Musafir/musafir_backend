import { Schema } from 'mongoose';

function transformValue(doc, ret: { [key: string]: any }) {
  delete ret.password;
  delete ret.__v;
  return ret;
}

export const RatingSchema = new Schema(
  {
    flagshipId: { type: Schema.Types.ObjectId, ref: 'Flagship', required: true }, 
    tripSeriesId: { type: Schema.Types.ObjectId, ref: 'TripSeries', required: false, index: true },
    departureId: { type: Schema.Types.ObjectId, ref: 'Departure', required: false, index: true },
    registrationId: { type: Schema.Types.ObjectId, ref: 'Registration', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true },
    review: { type: String, required: true },
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
