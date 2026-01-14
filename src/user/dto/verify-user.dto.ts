import {
  IsNotEmpty,
  IsEmail,
  IsString,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class VerifyUserDto {
  @ApiProperty({
    example: 'EL10BX',
  description: 'Refferal code',
  format: 'string',
  minLength: 6,
  maxLength: 6,
  })
  @IsOptional()
  @IsString()
  readonly referral1: string;

  @ApiProperty({
    example: 'EL10BX',
    description: 'Refferal code',
    format: 'string',
    minLength: 6,
    maxLength: 6,
  })
  @IsOptional()
  @IsString()
  readonly referral2: string;

  @ApiProperty({
    example: 'instagram.com/username',
  description: 'URL of an uploaded video',
  format: 'string',
  })
  @IsOptional()
  @IsString()
  readonly videoUrl: string;

  @ApiProperty({
    example: '650f2f4d2f4d2f4d2f4d2f4d',
    description: 'Flagship context for which verification is being requested',
    format: 'string',
    required: false,
  })
  @IsOptional()
  @IsString()
  readonly flagshipId?: string;

  @ApiProperty({
    example: false,
    description: 'Request a call to verify',
    format: 'boolean',
  })
  @IsOptional()
  @IsString()
  readonly requestCall: string;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Video file for verification',
  })
  readonly video: Express.Multer.File;
}
