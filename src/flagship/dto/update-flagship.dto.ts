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
import { Type } from 'class-transformer';
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
  @IsString()
  amount: string;

  @ApiProperty({ example: '35', description: 'Partial team discount count' })
  @IsString()
  count: string;

  @ApiProperty({
    example: true,
    description: 'Is partial team discount enabled',
  })
  enabled: boolean;
}

class SoloFemaleDiscountDto {
  @ApiProperty({
    example: '750',
    description: 'Solo female discount per ticket',
  })
  @IsString()
  amount: string;

  @ApiProperty({ example: '12', description: 'Solo female discount count' })
  @IsString()
  count: string;

  @ApiProperty({
    example: true,
    description: 'Is solo female discount enabled',
  })
  enabled: boolean;
}

class GroupDiscountDto {
  @ApiProperty({ example: '45 pax', description: 'Group discount value' })
  @IsString()
  value: string;

  @ApiProperty({
    example: '0',
    description: 'Discount per ticket for group discount',
  })
  @IsString()
  amount: string;

  @ApiProperty({ example: '35', description: 'Group discount count' })
  @IsString()
  count: string;

  @ApiProperty({ example: true, description: 'Is group discount enabled' })
  enabled: boolean;
}

class MusafirDiscountDto {
  @ApiProperty({ example: '0', description: 'Musafir discount budget' })
  @IsString()
  budget: string;

  @ApiProperty({ example: '35', description: 'Musafir discount count' })
  @IsString()
  count: string;

  @ApiProperty({ example: true, description: 'Is musafir discount enabled' })
  enabled: boolean;
}

class DiscountsDto {
  @ApiProperty({ example: '50000', description: 'Total discounts value' })
  @IsString()
  totalDiscountsValue: string;

  @ApiProperty({
    type: PartialTeamDiscountDto,
    description: 'Partial Team Discount',
  })
  @ValidateNested()
  @Type(() => PartialTeamDiscountDto)
  partialTeam: PartialTeamDiscountDto;

  @ApiProperty({
    type: SoloFemaleDiscountDto,
    description: 'Solo Female Discount',
  })
  @ValidateNested()
  @Type(() => SoloFemaleDiscountDto)
  soloFemale: SoloFemaleDiscountDto;

  @ApiProperty({ type: GroupDiscountDto, description: 'Group Discount' })
  @ValidateNested()
  @Type(() => GroupDiscountDto)
  group: GroupDiscountDto;

  @ApiProperty({ type: MusafirDiscountDto, description: 'Musafir Discount' })
  @ValidateNested()
  @Type(() => MusafirDiscountDto)
  musafir: MusafirDiscountDto;
}

export class UpdateFlagshipDto {
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
}
