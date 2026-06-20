import {
  IsNotEmpty,
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsIn,
  IsISO8601,
  IsBoolean,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class LocationDto {
  @ApiProperty({ example: 'Islamabad', description: 'Name of the location' })
  @IsOptional()
  @IsString()
  name: string;

  @ApiProperty({
    example: '0',
    description: 'Additional price for this location',
  })
  @IsOptional()
  @IsString()
  price: string;

  @ApiProperty({
    example: true,
    description: 'Indicates if this location is enabled',
  })
  @IsOptional()
  enabled: boolean;
}

class TierDto {
  @ApiProperty({ example: 'Standard', description: 'Name of the tier' })
  @IsOptional()
  @IsString()
  name: string;

  @ApiProperty({ example: '0', description: 'Price for this tier' })
  @IsOptional()
  @IsString()
  price: string;
}

class MattressTierDto {
  @ApiProperty({
    example: 'Mattress Add-On',
    description: 'Name of the mattress tier',
  })
  @IsOptional()
  @IsString()
  name: string;

  @ApiProperty({ example: '3000', description: 'Price for this mattress tier' })
  @IsOptional()
  @IsString()
  price: string;
}

class RoomSharingPreferenceDto {
  @ApiProperty({ example: 'Room Sharing', description: 'Name of the room sharing preference' })
  @IsOptional()
  @IsString()
  name: string;

  @ApiProperty({ example: '3000', description: 'Price for this room sharing preference' })
  @IsOptional()
  @IsString()
  price: string;
}

const parseJsonArrayValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value;
    } catch {
      return value;
    }
  }
  return value;
};

const parseJsonArray = ({ value }) => parseJsonArrayValue(value);

const parseJsonDtoArray = <T>(dtoClass: new () => T) => ({ value }) => {
  const parsed = parseJsonArrayValue(value);
  return Array.isArray(parsed) ? plainToInstance(dtoClass, parsed) : parsed;
};

class VibeScoreDto {
  @ApiProperty({ example: 'Nature and adventure', description: 'Trip fit label' })
  @IsOptional()
  @IsString()
  label: string;

  @ApiProperty({ example: 4, description: 'Score from 0 to 5' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score: number;
}

class ItineraryDayDto {
  @ApiProperty({ example: 1, description: 'Day number' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  day: number;

  @ApiProperty({ example: 'Arrival and welcome dinner', description: 'Day title' })
  @IsOptional()
  @IsString()
  title: string;

  @ApiProperty({ example: 'Arrival, hotel check-in, and group briefing.', description: 'Day summary' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty({ example: 'flagship/123/day-1.webp', description: 'Stored day image key or signed URL' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({ example: 'Hunza valley arrival view', description: 'SEO image title' })
  @IsOptional()
  @IsString()
  imageTitle?: string;

  @ApiProperty({ example: 'Travelers arriving in Hunza valley on day one of the trip', description: 'SEO image alt text' })
  @IsOptional()
  @IsString()
  imageAlt?: string;
}

class RouteWaypointDto {
  @ApiProperty({ example: 'Islamabad', description: 'Waypoint label' })
  @IsOptional()
  @IsString()
  label: string;

  @ApiProperty({ example: 'Start point and briefing city.', description: 'Waypoint description' })
  @IsOptional()
  @IsString()
  description?: string;
}

class DetailItemDto {
  @ApiProperty({ example: 'Accommodation', description: 'Item label' })
  @IsOptional()
  @IsString()
  label: string;

  @ApiProperty({ example: 'Shared hotel rooms for the full trip.', description: 'Item details' })
  @IsOptional()
  @IsString()
  detail?: string;

  @ApiProperty({ example: 'bed', description: 'Optional icon key' })
  @IsOptional()
  @IsString()
  icon?: string;
}

class AdditionalInfoDto {
  @ApiProperty({ example: 'Accommodation', description: 'Information title' })
  @IsOptional()
  @IsString()
  title: string;

  @ApiProperty({ example: 'Hotels and guest houses, subject to route availability.', description: 'Information body' })
  @IsOptional()
  @IsString()
  body: string;
}

class TripFaqDto {
  @ApiProperty({ example: 'What should I pack?', description: 'Question' })
  @IsOptional()
  @IsString()
  question: string;

  @ApiProperty({ example: 'Bring layered clothing and comfortable shoes.', description: 'Answer' })
  @IsOptional()
  @IsString()
  answer: string;
}

class CitySeatsDto {
  @ApiProperty({ example: 'Islamabad', description: 'City Name' })
  @IsOptional()
  @IsString()
  city: string;

  @ApiProperty({ example: 30, description: 'Seats for the city' })
  @IsOptional()
  @IsNumber()
  seats: number;
}
// Define separate classes for each nested discount type

class PartialTeamDiscountDto {
  @ApiProperty({ example: '1000', description: 'Partial team discount amount' })
  @IsOptional()
  @IsString()
  amount: string;

  @ApiProperty({ example: '35', description: 'Partial team discount count' })
  @IsOptional()
  @IsString()
  count: string;

  @ApiProperty({
    example: true,
    description: 'Is partial team discount enabled',
  })
  @IsOptional()
  enabled: boolean;
}

class SoloFemaleDiscountDto {
  @ApiProperty({
    example: '750',
    description: 'Solo female discount per ticket',
  })
  @IsOptional()
  @IsString()
  amount: string;

  @ApiProperty({ example: '12', description: 'Solo female discount count' })
  @IsOptional()
  @IsString()
  count: string;

  @ApiProperty({
    example: true,
    description: 'Is solo female discount enabled',
  })
  @IsOptional()
  enabled: boolean;

  @ApiProperty({ example: 0, description: 'Solo female discount used value' })
  @IsOptional()
  @IsNumber()
  usedValue?: number;

  @ApiProperty({ example: 0, description: 'Solo female discount used count' })
  @IsOptional()
  @IsNumber()
  usedCount?: number;
}

class GroupDiscountDto {
  @ApiProperty({ example: '45 pax', description: 'Group discount value' })
  @IsOptional()
  @IsString()
  value: string;

  @ApiProperty({
    example: '0',
    description: 'Discount per ticket for group discount',
  })
  @IsOptional()
  @IsString()
  amount: string;

  @ApiProperty({ example: '35', description: 'Group discount count' })
  @IsOptional()
  @IsString()
  count: string;

  @ApiProperty({ example: true, description: 'Is group discount enabled' })
  @IsOptional()
  enabled: boolean;

  @ApiProperty({ example: 0, description: 'Group discount used value' })
  @IsOptional()
  @IsNumber()
  usedValue?: number;

  @ApiProperty({ example: 0, description: 'Group discount used count' })
  @IsOptional()
  @IsNumber()
  usedCount?: number;
}

class MusafirDiscountDto {
  @ApiProperty({ example: '0', description: 'Musafir discount budget' })
  @IsOptional()
  @IsString()
  budget: string;

  @ApiProperty({
    example: '5000',
    description: 'Fixed to Rs.5000 per user cap; ignored if provided.',
  })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiProperty({ example: '35', description: 'Musafir discount count' })
  @IsOptional()
  @IsString()
  count: string;

  @ApiProperty({ example: true, description: 'Is musafir discount enabled' })
  @IsOptional()
  enabled: boolean;

  @ApiProperty({ example: 0, description: 'Musafir discount used value' })
  @IsOptional()
  @IsNumber()
  usedValue?: number;

  @ApiProperty({ example: 0, description: 'Musafir discount used count' })
  @IsOptional()
  @IsNumber()
  usedCount?: number;
}

class DiscountsDto {
  @ApiProperty({ example: '50000', description: 'Total discounts value' })
  @IsOptional()
  @IsString()
  totalDiscountsValue: string;

  @ApiProperty({
    type: PartialTeamDiscountDto,
    description: 'Partial Team Discount',
  })
  @ValidateNested()
  @Type(() => PartialTeamDiscountDto)
  @IsOptional()
  partialTeam?: PartialTeamDiscountDto;

  @ApiProperty({
    type: SoloFemaleDiscountDto,
    description: 'Solo Female Discount',
  })
  @ValidateNested()
  @Type(() => SoloFemaleDiscountDto)
  @IsOptional()
  soloFemale?: SoloFemaleDiscountDto;

  @ApiProperty({ type: GroupDiscountDto, description: 'Group Discount' })
  @ValidateNested()
  @Type(() => GroupDiscountDto)
  @IsOptional()
  group?: GroupDiscountDto;

  @ApiProperty({ type: MusafirDiscountDto, description: 'Musafir Discount' })
  @ValidateNested()
  @Type(() => MusafirDiscountDto)
  @IsOptional()
  musafir?: MusafirDiscountDto;
}

export class UpdateFlagshipDto {
  @ApiProperty({ example: 'Winter Retreat', description: 'Trip name' })
  @IsOptional()
  @IsString()
  tripName?: string;

  @ApiProperty({ example: 'flagship', description: 'Trip category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 'skardu', description: 'Destination identifier' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiProperty({ example: '2024-01-20', description: 'Start date (ISO)' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiProperty({ example: '2024-01-25', description: 'End date (ISO)' })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  // Pricing
  @ApiProperty({ example: '23,000 PKR', description: 'Base ticket price' })
  @IsOptional()
  @IsString()
  basePrice?: string;

  @ApiProperty({
    type: [LocationDto],
    description: 'Array of departure locations with prices',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocationDto)
  locations?: LocationDto[];

  @ApiProperty({ type: [TierDto], description: 'Array of tier-based add-ons' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierDto)
  tiers?: TierDto[];

  @ApiProperty({
    type: [MattressTierDto],
    description: 'Array of mattress tier add-ons',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MattressTierDto)
  mattressTiers?: MattressTierDto[];

  @ApiProperty({
    type: [RoomSharingPreferenceDto],
    description: 'Array of room sharing preference add-ons',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomSharingPreferenceDto)
  roomSharingPreference?: RoomSharingPreferenceDto[];
  
  // Content
  @ApiProperty({
    example: 'A short community-led mountain escape with soft adventure and clear logistics.',
    description: 'Short public summary for trip cards and hero sections',
  })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty({ example: 'Mountain Escape', description: 'Human-readable trip type' })
  @IsOptional()
  @IsString()
  tripType?: string;

  @ApiProperty({ example: 'Moderate', description: 'Physical effort label' })
  @IsOptional()
  @IsString()
  effortLevel?: string;

  @ApiProperty({ type: [VibeScoreDto], description: 'Trip fit scores shown to users' })
  @IsOptional()
  @Transform(parseJsonDtoArray(VibeScoreDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VibeScoreDto)
  vibeScores?: VibeScoreDto[];

  @ApiProperty({ type: [ItineraryDayDto], description: 'Structured day-by-day itinerary' })
  @IsOptional()
  @Transform(parseJsonDtoArray(ItineraryDayDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItineraryDayDto)
  itineraryDays?: ItineraryDayDto[];

  @ApiProperty({ type: [RouteWaypointDto], description: 'Route waypoints for trip route display' })
  @IsOptional()
  @Transform(parseJsonDtoArray(RouteWaypointDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteWaypointDto)
  routeWaypoints?: RouteWaypointDto[];

  @ApiProperty({ type: [DetailItemDto], description: 'Structured inclusions' })
  @IsOptional()
  @Transform(parseJsonDtoArray(DetailItemDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetailItemDto)
  includedItems?: DetailItemDto[];

  @ApiProperty({ type: [DetailItemDto], description: 'Structured exclusions' })
  @IsOptional()
  @Transform(parseJsonDtoArray(DetailItemDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetailItemDto)
  notIncludedItems?: DetailItemDto[];

  @ApiProperty({ type: [AdditionalInfoDto], description: 'Accommodation, transport, flight, luggage, and other useful information' })
  @IsOptional()
  @Transform(parseJsonDtoArray(AdditionalInfoDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalInfoDto)
  additionalInfo?: AdditionalInfoDto[];

  @ApiProperty({ type: [TripFaqDto], description: 'Trip-specific FAQs' })
  @IsOptional()
  @Transform(parseJsonDtoArray(TripFaqDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripFaqDto)
  tripFaqs?: TripFaqDto[];

  @ApiProperty({
    example: '<p>Plan details here...</p>',
    description: 'Travel plan content in HTML or text format',
  })
  @IsOptional()
  @IsString()
  travelPlan?: string;

  @ApiProperty({
    example: '<ul><li>TOCs and FAQs here...</li></ul>',
    description: 'TOCs, FAQs, and inclusions content',
  })
  @IsOptional()
  @IsString()
  tocs?: string;

  @ApiProperty({
    type: [String],
    description: 'List of uploaded files with name and size',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => String)
  files?: Express.Multer.File[];

  @ApiProperty({
    type: [String],
    description: 'Uploaded itinerary day images ordered by itinerary day index',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => String)
  itineraryDayImages?: Express.Multer.File[];

  @ApiProperty({
    type: [Number],
    description: 'Zero-based itinerary day indexes matching itineraryDayImages order',
  })
  @IsOptional()
  @Transform(parseJsonArray)
  @IsArray()
  itineraryDayImageIndexes?: number[];

  @ApiProperty({
    type: [String],
    description: 'List of uploaded files with name and size',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => String)
  detailedPlanDoc?: Express.Multer.File;

  // Seat toggles and pricing
  @ApiProperty({ required: false, description: 'Enable/disable gender split' })
  @IsOptional()
  @IsBoolean()
  genderSplitEnabled?: boolean;

  @ApiProperty({ required: false, description: 'Enable/disable city split' })
  @IsOptional()
  @IsBoolean()
  citySplitEnabled?: boolean;

  @ApiProperty({ required: false, description: 'Enable/disable mattress split' })
  @IsOptional()
  @IsBoolean()
  mattressSplitEnabled?: boolean;

  @ApiProperty({
    required: false,
    description: 'Delta subtracted from base seat price when mattress split is enabled',
  })
  @IsOptional()
  @IsNumber()
  mattressPriceDelta?: number;

  @ApiProperty({
    required: false,
    description: 'Absolute early-bird price override (applied before add-ons)',
  })
  @IsOptional()
  @IsNumber()
  earlyBirdPrice?: number;
  
  // Seats
  @ApiProperty({ example: 98, description: 'Total capacity' })
  @IsOptional()
  @IsNumber()
  totalSeats?: number;

  @ApiProperty({ example: 49, description: 'Calculated female seats' })
  @IsOptional()
  @IsNumber()
  femaleSeats?: number;

  @ApiProperty({ example: 49, description: 'Calculated male seats' })
  @IsOptional()
  @IsNumber()
  maleSeats?: number;

  @ApiProperty({ type: Object, description: 'City-wise seat distribution' })
  @IsOptional()
  citySeats?: Record<string, any>;

  @ApiProperty({ example: 49, description: 'Calculated bed seats' })
  @IsOptional()
  @IsNumber()
  bedSeats?: number;

  @ApiProperty({ example: 49, description: 'Calculated mattress seats' })
  @IsOptional()
  @IsNumber()
  mattressSeats?: number;

  // Discounts fields
  @ApiProperty({ type: DiscountsDto, description: 'Discounts settings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DiscountsDto)
  discounts?: DiscountsDto;

  // payment
  @ApiProperty({
    example: 'someid',
    description: 'Payment for that flagship through this bank',
  })
  @IsOptional()
  @IsString()
  selectedBank?: string;

  @ApiProperty({ example: true, description: 'Is flagship is public or not' })
  @IsOptional()
  publish: boolean;

  @ApiProperty({
    example: 'live',
    description: 'Status of the flagship, Is it live or completed',
    enum: ['unpublished', 'published', 'completed'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['unpublished', 'published', 'completed'])
  status: string;

  @ApiProperty({
    example: 'public',
    description: 'Controls visibility for end users',
    enum: ['public', 'private'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['public', 'private'])
  visibility?: string;

  @ApiProperty({ description: 'Trip dates (any string format)' })
  @IsOptional()
  @IsString()
  tripDates?: string;

  @ApiProperty({ description: 'Registration Deadline (ISO date string)' })
  @IsOptional()
  @IsISO8601()
  registrationDeadline?: string;

  @ApiProperty({ description: 'Advance Payment Deadline (ISO date string)' })
  @IsOptional()
  @IsISO8601()
  advancePaymentDeadline?: string;

  @ApiProperty({ description: 'Early Bird Deadline (ISO date string)' })
  @IsOptional()
  @IsISO8601()
  earlyBirdDeadline?: string;

  @ApiProperty({
    example: '64f1c2b13e9b4f0b9a7f9b2a',
    description: 'Concurrency token for optimistic updates.',
  })
  @IsOptional()
  @IsString()
  contentVersion?: string;

  @ApiProperty({
    example: '2024-01-31T12:00:00.000Z',
    description: 'Last known update time for optimistic concurrency.',
  })
  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  @ApiProperty({
    example: false,
    description: 'Suppress user notifications for this update.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0' || normalized === '') return false;
      return raw;
    }
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  })
  @IsBoolean()
  silentUpdate?: boolean;

  @ApiProperty({
    example: ['flagship/123/image.webp'],
    description: 'Remove existing images by storage key.',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed;
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  removeImages?: string[];

  @ApiProperty({
    example: true,
    description: 'Remove existing detailed plan document.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  removeDetailedPlan?: boolean;
}
