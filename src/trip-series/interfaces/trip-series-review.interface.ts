import { Document, Types } from 'mongoose';

export interface TripSeriesReview extends Document {
  tripSeriesId: Types.ObjectId;
  departureId?: Types.ObjectId;
  registrationId?: Types.ObjectId;
  userId?: Types.ObjectId;
  rating: number;
  answers?: Array<{
    questionId: string;
    questionLabel: string;
    value: string | number | boolean;
    valueLabel?: string;
  }>;
  review?: string;
  whistleblowing?: {
    category?: string;
    message?: string;
    contactConsent?: boolean;
  };
  media?: Array<{ url: string; type?: 'image' | 'video'; alt?: string }>;
  helpfulCount?: number;
  helpfulUserIds?: Types.ObjectId[];
  reward?: {
    amount?: number;
    currency?: 'PKR';
    transactionId?: string;
    creditedAt?: Date;
  };
  sourceType: 'registration' | 'manual' | 'imported';
  status: 'pending' | 'published' | 'hidden';
  featured?: boolean;
}
