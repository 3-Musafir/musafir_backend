import {
  IsString,
  IsOptional,
  IsNumberString,
  Matches,
  IsIn,
  ValidateIf,
  Length,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({
    example: 'Ihtasham Nazir',
    description: 'The name of the User',
    format: 'string',
    minLength: 6,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  readonly fullName?: string;

  @ApiProperty({
    example: 'https://cdn.example.com/avatar.jpg',
    description: 'Profile image URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/|data:image\/[a-zA-Z]+;base64,).+/i, {
    message: 'Profile image must be an http(s) URL or data URL',
  })
  readonly profileImg?: string;

  @ApiProperty({
    example: '03********7',
    description: 'Phone number of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  @IsNumberString()
  @Matches(/^0?\d{10}$/, {
    message: 'Phone must be 10 digits (optionally starting with 0)',
  })
  readonly phone?: string;

  @ApiProperty({
    example: 'Lahore',
    description: 'City of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  readonly city?: string;

  @ApiProperty({
    example: 'Comsats University',
    description: 'University or workplace of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.employmentStatus !== 'unemployed')
  @IsNotEmpty()
  readonly university?: string;

  @ApiProperty({
    example: 'student',
    description: 'Employment status of the User',
    enum: ['student', 'employed', 'selfEmployed', 'unemployed'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['student', 'employed', 'selfEmployed', 'unemployed'])
  readonly employmentStatus?: 'student' | 'employed' | 'selfEmployed' | 'unemployed';

  @ApiProperty({
    example: 'instagram.com/username',
    description: 'Active Social Media of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  readonly socialLink?: string;

  @ApiProperty({
    example: 'male',
    description: 'Gender of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  readonly gender?: string;

  @ApiProperty({
    example: '33**********5',
    description: 'CNIC of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  @Length(13, 13, { message: 'CNIC must be exactly 13 digits' })
  readonly cnic?: string;
}
