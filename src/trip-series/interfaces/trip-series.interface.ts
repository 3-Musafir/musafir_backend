import { Document, Types } from 'mongoose';

export interface MediaItem {
  url: string;
  title?: string;
  alt?: string;
  type?: 'image' | 'video';
}

export interface TripSeries extends Document {
  title: string;
  slug: string;
  destination: string;
  country?: string;
  region?: string;
  category: string;
  tripTypes?: string[];
  mood?: string[];
  audience?: string[];
  heroMedia?: MediaItem[];
  gallery?: MediaItem[];
  images?: string[];
  overview?: string;
  summary?: string;
  emotionalPositioning?: string;
  highlights?: string[];
  itineraryDays?: any[];
  routeWaypoints?: any[];
  includedItems?: any[];
  notIncludedItems?: any[];
  optionalActivities?: any[];
  additionalInfo?: any[];
  tripFaqs?: any[];
  safetyNotes?: string;
  communityNotes?: string;
  effortLevel?: string;
  difficulty?: string;
  vibeScores?: any[];
  durationMin?: number;
  durationMax?: number;
  totalKilometers?: number;
  estimatedStartingPrice?: number;
  ratingAverage?: number;
  ratingCount?: number;
  seo?: {
    title?: string;
    description?: string;
    keywords?: string[];
    ogImage?: string;
    canonical?: string;
  };
  status: 'active' | 'hidden' | 'archived';
  relatedSeries?: Types.ObjectId[];
  legacyFlagshipIds?: Types.ObjectId[];
  contentVersion: string;
  createdBy: Types.ObjectId;
}
