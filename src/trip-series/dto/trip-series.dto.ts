import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const parseJson = ({ value }) => {
  if (value === undefined || value === null || value === '') return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseStringArray = ({ value }) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
};

class MediaItemDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  alt?: string;

  @IsOptional()
  @IsIn(['image', 'video'])
  type?: string;
}

class SeoDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  keywords?: string[];

  @IsOptional()
  @IsString()
  ogImage?: string;

  @IsOptional()
  @IsString()
  canonical?: string;
}

const parseJsonDto = <T>(dtoClass: new () => T) => ({ value }) => {
  const parsed = parseJson({ value });
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? plainToInstance(dtoClass, parsed)
    : parsed;
};

export class CreateTripSeriesDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  @IsNotEmpty()
  destination: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsIn(['local', 'international', 'girls-first', 'romantic', 'corporate', 'custom', 'flagship', 'adventure', 'student', 'detox'])
  category?: string;

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  tripTypes?: string[];

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  mood?: string[];

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  audience?: string[];

  @IsOptional()
  @Transform(parseJson)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  heroMedia?: MediaItemDto[];

  @IsOptional()
  @Transform(parseJson)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  gallery?: MediaItemDto[];

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsString()
  overview?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  emotionalPositioning?: string;

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  highlights?: string[];

  @IsOptional()
  @Transform(parseJson)
  itineraryDays?: any[];

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  itineraryDayImageIndexes?: string[];

  @IsOptional()
  @Transform(parseJson)
  routeWaypoints?: any[];

  @IsOptional()
  @Transform(parseJson)
  includedItems?: any[];

  @IsOptional()
  @Transform(parseJson)
  notIncludedItems?: any[];

  @IsOptional()
  @Transform(parseJson)
  optionalActivities?: any[];

  @IsOptional()
  @Transform(parseJson)
  additionalInfo?: any[];

  @IsOptional()
  @Transform(parseJson)
  tripFaqs?: any[];

  @IsOptional()
  @IsString()
  safetyNotes?: string;

  @IsOptional()
  @IsString()
  communityNotes?: string;

  @IsOptional()
  @IsString()
  effortLevel?: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @Transform(parseJson)
  vibeScores?: any[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalKilometers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedStartingPrice?: number;

  @IsOptional()
  @Transform(parseJsonDto(SeoDto))
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;

  @IsOptional()
  @IsIn(['active', 'hidden', 'archived'])
  status?: string;
}

export class UpdateTripSeriesDto extends CreateTripSeriesDto {
  @IsOptional()
  @IsString()
  contentVersion?: string;
}

export class CreateDepartureDto {
  @IsMongoId()
  @IsNotEmpty()
  tripSeriesId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @Transform(parseJson)
  departureCities?: any[];

  @IsOptional()
  @IsString()
  basePrice?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  earlyBirdPrice?: number;

  @IsOptional()
  @IsDateString()
  earlyBirdDeadline?: string;

  @IsOptional()
  @Transform(parseJson)
  tiers?: any[];

  @IsOptional()
  @Transform(parseJson)
  mattressTiers?: any[];

  @IsOptional()
  @Transform(parseJson)
  roomSharingPreference?: any[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  femaleCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maleCapacity?: number;

  @IsOptional()
  @Transform(parseJson)
  citySeats?: Record<string, any>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bedSeats?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mattressSeats?: number;

  @IsOptional()
  @IsBoolean()
  genderSplitEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  citySplitEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  mattressSplitEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mattressPriceDelta?: number;

  @IsOptional()
  @Transform(parseJson)
  paymentRules?: any;

  @IsOptional()
  @Transform(parseJson)
  discounts?: any;

  @IsOptional()
  @IsString()
  selectedBank?: string;

  @IsOptional()
  @IsBoolean()
  flightIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  visaIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  landOnly?: boolean;

  @IsOptional()
  @IsString()
  captain?: string;

  @IsOptional()
  @Transform(parseJson)
  hotels?: any[];

  @IsOptional()
  @Transform(parseJson)
  itineraryOverrides?: any[];

  @IsOptional()
  @Transform(parseJson)
  inclusionsOverrides?: any[];

  @IsOptional()
  @IsString()
  bookingFormUrl?: string;

  @IsOptional()
  @IsString()
  whatsappGroupLink?: string;

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  labels?: string[];

  @IsOptional()
  @IsIn(['draft', 'open', 'filling_fast', 'sold_out', 'waitlist', 'completed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: string;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsOptional()
  @IsDateString()
  advancePaymentDeadline?: string;

  @IsOptional()
  @IsDateString()
  cancellationDeadline?: string;

  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class UpdateDepartureDto extends CreateDepartureDto {
  @IsOptional()
  @IsMongoId()
  tripSeriesId: string;

  @IsOptional()
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  contentVersion?: string;
}

export class TripSeriesFilterDto {
  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tripType?: string;

  @IsOptional()
  @IsString()
  mood?: string;

  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budgetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budgetMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lastMinuteDays?: number;
}

export class DepartureFilterDto {
  @IsOptional()
  @IsString()
  series?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budgetMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMax?: number;
}

export class CreateTripSeriesReviewDto {
  @IsMongoId()
  @IsNotEmpty()
  tripSeriesId: string;

  @IsOptional()
  @IsMongoId()
  departureId?: string;

  @IsOptional()
  @IsMongoId()
  registrationId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @Transform(parseJson)
  @IsArray()
  answers?: any[];

  @IsOptional()
  @IsString()
  review?: string;

  @IsOptional()
  @Transform(parseJson)
  whistleblowing?: any;

  @IsOptional()
  @Transform(parseJson)
  media?: any[];

  @IsOptional()
  @IsIn(['pending', 'published', 'hidden'])
  status?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;
}

export class SubmitTripSeriesReviewDto {
  @IsOptional()
  @IsMongoId()
  departureId?: string;

  @IsOptional()
  @IsMongoId()
  registrationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @Transform(parseJson)
  @IsArray()
  answers: any[];

  @IsOptional()
  @IsString()
  review?: string;

  @IsOptional()
  @Transform(parseJson)
  whistleblowing?: any;

  @IsOptional()
  @Transform(parseJson)
  media?: any[];
}

export class UpdateTripSeriesReviewDto {
  @IsOptional()
  @IsMongoId()
  departureId?: string;

  @IsOptional()
  @IsMongoId()
  registrationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Transform(parseJson)
  @IsArray()
  answers?: any[];

  @IsOptional()
  @IsString()
  review?: string;

  @IsOptional()
  @Transform(parseJson)
  whistleblowing?: any;

  @IsOptional()
  @Transform(parseJson)
  media?: any[];

  @IsOptional()
  @IsIn(['pending', 'published', 'hidden'])
  status?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;
}
