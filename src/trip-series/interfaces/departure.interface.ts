import { Document, Types } from 'mongoose';

export interface Departure extends Document {
  tripSeriesId: Types.ObjectId;
  legacyFlagshipId?: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  durationDays?: number;
  durationNights?: number;
  departureCities?: Array<{ name: string; price: string; enabled: boolean }>;
  basePrice?: string;
  earlyBirdPrice?: number;
  earlyBirdDeadline?: Date;
  tiers?: Array<{ name: string; price: string }>;
  mattressTiers?: Array<{ name: string; price: string }>;
  roomSharingPreference?: Array<{ name: string; price: string }>;
  totalCapacity?: number;
  femaleCapacity?: number;
  maleCapacity?: number;
  confirmedFemaleCount?: number;
  confirmedMaleCount?: number;
  waitlistedFemaleCount?: number;
  waitlistedMaleCount?: number;
  citySeats?: Record<string, any>;
  bedSeats?: number;
  mattressSeats?: number;
  genderSplitEnabled?: boolean;
  citySplitEnabled?: boolean;
  mattressSplitEnabled?: boolean;
  mattressPriceDelta?: number;
  paymentRules?: {
    depositAmount?: number;
    partialPaymentPercent?: number;
    paymentDeadline?: Date;
  };
  discounts?: {
    totalDiscountsValue?: string;
    soloFemale?: {
      enabled?: boolean;
      amount?: string;
      count?: string;
      deadline?: Date;
      usedValue?: number;
      usedCount?: number;
    };
    group?: {
      enabled?: boolean;
      value?: string;
      amount?: string;
      count?: string;
      deadline?: Date;
      usedValue?: number;
      usedCount?: number;
    };
    musafir?: {
      enabled?: boolean;
      budget?: string;
      amount?: string;
      count?: string;
      deadline?: Date;
      usedValue?: number;
      usedCount?: number;
    };
  };
  selectedBank?: string;
  flightIncluded?: boolean;
  visaIncluded?: boolean;
  landOnly?: boolean;
  captain?: string;
  hotels?: any[];
  itineraryOverrides?: any[];
  inclusionsOverrides?: any[];
  bookingFormUrl?: string;
  whatsappGroupLink?: string;
  labels?: string[];
  status: 'draft' | 'open' | 'filling_fast' | 'sold_out' | 'waitlist' | 'completed' | 'cancelled';
  visibility: 'public' | 'private';
  hiddenBySeries?: boolean;
  registrationDeadline?: Date;
  advancePaymentDeadline?: Date;
  cancellationDeadline?: Date;
  adminNotes?: string;
  contentVersion: string;
  createdBy: Types.ObjectId;
}
