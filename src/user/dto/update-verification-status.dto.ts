import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { VerificationStatus } from '../../constants/verification-status.enum';

export class UpdateVerificationStatusDto {
  @ApiProperty({
    enum: VerificationStatus,
    description: 'New verification status (verified or unverified)',
  })
  @IsEnum(VerificationStatus)
  status: VerificationStatus;
}

