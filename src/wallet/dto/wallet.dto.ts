import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { WALLET_TOPUP_PACKAGES_PKR } from '../wallet.constants';

export class WalletListTransactionsQueryDto {
  @ApiPropertyOptional({ example: 1, description: '1-based page (uses skip/limit). Prefer cursor for performance.' })
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

  @ApiPropertyOptional({ example: '65f1d0c2f0c2d0c2f0c2d0c2' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 'topup_credit' })
  @IsOptional()
  @IsString()
  type?: string;
}

export class AdminWalletCreditDto {
  @ApiProperty({ example: '65f1d0c2f0c2d0c2f0c2d0c2' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ example: 'topup_2025_02_01_0001' })
  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ example: 20000, enum: WALLET_TOPUP_PACKAGES_PKR })
  @Type(() => Number)
  @IsNumber()
  @IsIn(WALLET_TOPUP_PACKAGES_PKR as unknown as number[])
  amount: number;

  @ApiPropertyOptional({ example: 'Top-up approved by admin' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class AdminWalletAdjustDto {
  @ApiProperty({ example: '65f1d0c2f0c2d0c2f0c2d0c2' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ example: 'adjust_2025_02_01_0001' })
  @IsNotEmpty()
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'credit', enum: ['credit', 'debit'] })
  @IsNotEmpty()
  @IsString()
  @IsIn(['credit', 'debit'])
  direction: 'credit' | 'debit';

  @ApiPropertyOptional({ example: 'Manual adjustment' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class AdminWalletsQueryDto {
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

  @ApiPropertyOptional({ example: 'john@gmail.com' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Include users with no wallet balance doc (defaults to false).',
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  includeEmpty?: boolean;
}
