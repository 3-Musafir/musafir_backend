import { IsOptional, IsString } from 'class-validator';

export class AdminDeleteRegistrationDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
