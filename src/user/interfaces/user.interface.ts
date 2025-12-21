import { Document, Types } from 'mongoose';

export interface VerificationSubSchema {
  verificationID?: string;
  encodedVideo?: string;
  referralIDs?: string[];
  status?: 'unverified' | 'pending' | 'verified' | 'rejected';
  videoLink?: string;
  videoStorageKey?: string;
  verificationDate?: Date;
  VerificationRequestDate?: Date;
  RequestCall: boolean;
}

export interface User {
  _id: Types.ObjectId; // or Types.ObjectId | string if you sometimes string-ify it
  legacyUserKey?: string;
  fullName: string;
  profileImg?: string;
  email?: string;
  password?: string;
  googleId?: string;
  phone: string;
  referralID?: string;
  gender: 'male' | 'female' | 'other';
  cnic?: string;
  university?: string;
  employmentStatus?: 'student' | 'employed' | 'selfEmployed' | 'unemployed';
  socialLink?: string;
  dateOfBirth?: string;
  working?: boolean;
  city?: string;
  heardFrom?: string;
  roles: string[]; // this should be an array, not a tuple
  emailVerified: boolean;
  verification?: VerificationSubSchema;
  discountApplicable?: number;
  numberOfFlagshipsAttended?: number;
  referredBy?: Types.ObjectId;
  referredCode?: string;
}

// When dealing with actual Mongoose documents:
export type UserDocument = User & Document;
