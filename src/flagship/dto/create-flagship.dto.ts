import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsISO8601,
  IsNumber,
  IsIn,
} from 'class-validator';

export class CreateFlagshipDto {
  // Total Seats
  // @ApiProperty({
  //   example: '20',
  //   description: 'Total seats available',
  //   format: 'number',
  // })
  // @IsNotEmpty()
  // @IsNumber()
  // readonly seats: number;

  // Total trip duration

  days?: number;

  created_By?: string;

  @ApiProperty({
    example: 'Hunz Trip',
    description: 'Name of the flagship trip',
  })
  @IsNotEmpty()
  @IsString()
  tripName: string;

  @ApiProperty({
    example: 'Destination A',
    description: 'The destination for the trip',
  })
  @IsNotEmpty()
  @IsString()
  destination: string;

  @ApiProperty({
    example: '2025-02-28T00:00:00.000Z',
    description: 'Start date of the trip in ISO 8601 format',
  })
  @IsNotEmpty()
  @IsISO8601()
  startDate: Date;

  @ApiProperty({
    example: '2025-03-05T00:00:00.000Z',
    description: 'End date of the trip in ISO 8601 format',
  })
  @IsNotEmpty()
  @IsISO8601()
  endDate: Date;

  @ApiProperty({
    example: 'flagship',
    description: 'Category of the trip',
    enum: ['detox', 'flagship', 'adventure', 'student', 'international'],
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['detox', 'flagship', 'adventure', 'student', 'international'])
  category: string;

  @ApiProperty({
    example: 'public',
    description: 'Visibility of the trip, either public or private',
    enum: ['public', 'private'],
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['public', 'private'])
  visibility: string;

}
