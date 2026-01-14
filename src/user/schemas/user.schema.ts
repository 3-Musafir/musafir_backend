import * as bcrypt from 'bcrypt';
import { Schema } from 'mongoose';
import * as validator from 'validator';
import { VerificationStatus, getVerificationStatusValues } from '../../constants/verification-status.enum';

function transformValue(doc, ret: { [key: string]: any }) {
  delete ret.password;
  delete ret.__v;
  return ret;
}

interface VerificationSchema {
  VerificationID?: string;
  EncodedVideo?: string;
  ReferralIDs?: string[];
  status?: VerificationStatus;
  method?: string;
  flagshipId?: string;
  VideoLink?: string;
  videoStorageKey?: string;
  VerificationDate?: Date;
  VerificationRequestDate?: Date;
  RequestCall: boolean;
}

const VerificationSchema = new Schema<VerificationSchema>({
  VerificationID: { type: String, required: false },
  EncodedVideo: { type: String, required: false },
  ReferralIDs: [{ type: String, required: false }],
  status: {
    type: String,
    enum: getVerificationStatusValues(),
    default: VerificationStatus.UNVERIFIED,
  },
  method: { type: String, required: false },
  flagshipId: { type: String, required: false },
  RequestCall: { type: Boolean, required: false },
  VideoLink: { type: String, required: false },
  videoStorageKey: { type: String, required: false },
  VerificationDate: { type: Date, required: false },
  VerificationRequestDate: { type: Date, required: false },
});

export const UserSchema = new Schema(
  {
    legacyUserKey: { type: String, required: false, index: true, unique: true, sparse: true },
    fullName: { type: String, required: false },

    profileImg: { type: String, required: false },

    email: {
      type: String,
      lowercase: true,
      validate: {
        validator: function (value: string) {
          // Only validate if email is provided
          if (!value || value.trim() === '') {
            return true; // Allow empty/whitespace emails
          }
          return validator.isEmail(value);
        },
        message: 'Please provide a valid email address'
      },
      required: false,
    },

    password: { type: String, required: false },

    googleId: { type: String, required: false },

    // Phone is optional at creation so Google signups can complete and
    // provide it later in profile completion. Validation for normal
    // signups happens in the DTO layer.
    phone: { type: String, required: false },

    referralID: { type: String, required: true },

    gender: {
      type: String,
      required: false,
      enum: ['male', 'female', 'other'],
    },

    cnic: {
      type: String,
      required: false,
      minlength: 13,
      maxlength: 13,
      validate: {
        validator: function (value: string) {
          // Allow missing/empty CNIC, otherwise enforce exactly 13 digits
          if (!value) return true;
          return /^[0-9]{13}$/.test(value);
        },
        message: 'CNIC must be exactly 13 digits',
      },
    },

    university: { type: String, required: false },

    employmentStatus: {
      type: String,
      required: false,
      enum: ['student', 'employed', 'selfEmployed', 'unemployed'],
      default: 'unemployed',
    },

    socialLink: { type: String, required: false },

    dateOfBirth: { type: String, required: false },

    working: { type: Boolean, required: false },

    city: { type: String, required: false },

    heardFrom: { type: String, required: false },

    roles: { type: [String], default: ['musafir'] },

    emailVerified: { type: Boolean, required: false, default: false },

    verification: { 
      type: VerificationSchema, 
      required: false, 
      default: () => ({ status: VerificationStatus.UNVERIFIED, RequestCall: false }) 
    },

    discountApplicable: { type: Number, required: false, default: 0 },

    numberOfFlagshipsAttended: { type: Number, required: false, default: 0 },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    referredCode: { type: String, required: false },
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

UserSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('password')) {
      return next();
    }
    if (!this.password) {
      return next(new Error('Password not set'));
    }
    if (!this.password || typeof this.password !== 'string') {
      throw new Error('Invalid or missing password');
    }
    const hashed = await bcrypt.hash(this['password'], 10);
    this['password'] = hashed;
    return next();
  } catch (err) {
    return next(err);
  }
});
