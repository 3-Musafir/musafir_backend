import {
  IsNotEmpty,
  IsString,
  IsOptional,
  Length,
  IsNumberString,
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
    example: '03********7',
    description: 'Phone number of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  @IsNumberString()
  @Length(10, 10, { message: 'Phone must be exactly 10 digits' })
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
  readonly university?: string;

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
