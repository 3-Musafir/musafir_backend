import {
  IsNotEmpty,
  IsEmail,
  IsString,
  IsOptional,
  Length,
  IsNumberString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class BaseUserDto {
  @ApiProperty({
    example: 'Ihtasham Nazir',
    description: 'The name of the User',
    format: 'string',
    minLength: 6,
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsString()
  readonly fullName: string;

  @ApiProperty({
    example: 'male',
    description: 'The gender of the User',
    format: 'string',
  })
  @IsNotEmpty()
  @IsString()
  readonly gender: string;

  @ApiProperty({
    example: '03********7',
    description: 'Phone number of the User',
    format: 'string',
  })
  @IsNotEmpty()
  @IsString()
  @IsNumberString()
  @Length(10, 10, { message: 'Phone must be exactly 10 digits' })
  readonly phone: string;

  @ApiProperty({
    example: 'instagram.com/username',
    description: 'Active Social Media of the User',
    format: 'string',
  })
  @IsNotEmpty()
  @IsString()
  readonly socialLink: string;

  @ApiProperty({
    example: '33**********5',
    description: 'CNIC of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  @Length(13, 13, { message: 'CNIC must be exactly 13 digits' })
  readonly cnic?: string;

  @ApiProperty({
    example: 'Comsats University',
    description: 'University or workplace of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  readonly university?: string;

  @ApiProperty({
    example: 'ihtasham@gmail.com',
    description: 'The email of the User',
    format: 'email',
    uniqueItems: true,
  })
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  readonly email: string;
}

export class CreateUserDto extends BaseUserDto {
  @ApiProperty({
    example: 'secret password change me!',
    description: 'The password of the User',
    format: 'string',
  })
  @IsNotEmpty()
  @IsString()
  readonly password: string;
}

export class CreateGoogleUserDto extends BaseUserDto {
  @ApiProperty({
    format: 'string',
    description: 'Google OAuth ID for authentication',
  })
  @IsNotEmpty()
  @IsString()
  readonly googleId: string;
}


export class EmailUserDto {

  @ApiProperty({
    example: 'Ihtasham Nazir',
    description: 'The name of the User',
    format: 'string',
  })
  @IsOptional()
  @IsString()
  readonly fullName: string;

  @ApiProperty({
    example: 'ihtasham@gmail.com',
    description: 'The email of the User',
    format: 'email',
    uniqueItems: true,
  })
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  readonly email: string;

  @ApiProperty({
    format: 'string',
    description: 'Google OAuth ID for authentication',
  })
  @IsNotEmpty()
  @IsString()
  readonly googleId: string;
}
