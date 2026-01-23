import { Document, Types } from 'mongoose';
import { VerificationStatus } from '../../constants/verification-status.enum';

export interface VerificationHistoryEntry {
  status?: string;
  method?: string;
  reason?: string;
  source?: string;
  flagshipId?: string;
  createdAt?: Date;
}

export interface VerificationSubSchema {
  // Legacy persisted fields (schema casing)
  VerificationID?: string;
  EncodedVideo?: string;
  ReferralIDs?: string[];
  VideoLink?: string;
  VerificationDate?: Date;
  VerificationRequestDate?: Date;
  RequestCall: boolean;

  // Canonical fields used by clients/services (response aliases)
  verificationID?: string;
  encodedVideo?: string;
  referralIDs?: string[];
  status?: VerificationStatus;
  method?: string;
  flagshipId?: string;
  videoLink?: string;
  videoStorageKey?: string;
  verificationDate?: Date;
  verificationRequestDate?: Date;
  requestCall?: boolean;
  history?: VerificationHistoryEntry[];
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
