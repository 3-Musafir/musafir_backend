// dto/flagship-filter.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class FlagshipFilterDto {
  @ApiPropertyOptional({ description: 'Trip name (case-insensitive)' })
  @IsOptional()
  @IsString()
  tripName?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO format)' })
  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @ApiPropertyOptional({ description: 'End date (ISO format)' })
  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Category',
    enum: ['detox', 'flagship', 'adventure', 'student'],
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Visibility',
    enum: ['public', 'private'],
  })
  @IsOptional()
  @IsString()
  visibility?: string;

  @ApiPropertyOptional({ description: 'Created by (user id)' })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({ description: 'Destination (case-insensitive)' })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiPropertyOptional({ description: 'Days of trip' })
  @IsOptional()
  @IsNumber()
  days?: number;

  @ApiPropertyOptional({ description: 'Seats available' })
  @IsOptional()
  @IsNumber()
  seats?: number;

  @ApiPropertyOptional({
    description: 'status',
    enum: ['unpublished', 'published', 'completed'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Total seats' })
  @IsOptional()
  @IsNumber()
  totalSeats?: number;

  @ApiPropertyOptional({ description: 'Female seats' })
  @IsOptional()
  @IsNumber()
  femaleSeats?: number;

  @ApiPropertyOptional({ description: 'Male seats' })
  @IsOptional()
  @IsNumber()
  maleSeats?: number;

  @ApiPropertyOptional({ description: 'Bed seats' })
  @IsOptional()
  @IsNumber()
  bedSeats?: number;

  @ApiPropertyOptional({ description: 'Registration deadline (ISO format)' })
  @IsOptional()
  @IsDateString()
  registrationDeadline?: Date;

  @ApiPropertyOptional({ description: 'Advance payment deadline (ISO format)' })
  @IsOptional()
  @IsDateString()
  advancePaymentDeadline?: Date;

  @ApiPropertyOptional({ description: 'Early bird deadline (ISO format)' })
  @IsOptional()
  @IsDateString()
  earlyBirdDeadline?: Date;

  @ApiPropertyOptional({ description: 'Publish status' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : false))
  publish?: boolean;

  @ApiPropertyOptional({
    description: 'Include past flagships (endDate < now)',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : false))
  includePast?: boolean;
}
