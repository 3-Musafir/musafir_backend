import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { WALLET_TOPUP_PACKAGES_PKR } from 'src/wallet/wallet.constants';

export class CreateTopupRequestDto {
  @ApiProperty({ example: 20000, enum: WALLET_TOPUP_PACKAGES_PKR })
  @Type(() => Number)
  @IsIn(WALLET_TOPUP_PACKAGES_PKR as unknown as number[])
  packageAmount: number;
}

export class AdminListTopupsQueryDto {
  @ApiPropertyOptional({ example: 'pending', enum: ['pending', 'processed', 'rejected'] })
  @IsOptional()
  @IsString()
  status?: 'pending' | 'processed' | 'rejected';

  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class AdminRejectTopupDto {
  @ApiPropertyOptional({ example: 'Payment not received' })
  @IsOptional()
  @IsString()
  reason?: string;
}
