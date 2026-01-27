import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VerificationStatus } from '../../constants/verification-status.enum';

export class UpdateVerificationStatusDto {
  @ApiProperty({
    enum: VerificationStatus,
    description: 'New verification status (verified or unverified)',
  })
  @IsEnum(VerificationStatus)
  status: VerificationStatus;

  @ApiProperty({
    required: false,
    description: 'Optional note/reason for verification decision',
  })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({
    required: false,
    description: 'Registration ID to build a deep link for the user',
  })
  @IsOptional()
  @IsString()
  registrationId?: string;
}
