import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({
    example: 'Bank of America',
    description: 'Name of the bank',
  })
  @IsNotEmpty()
  @IsString()
  bankName: string;

  @ApiProperty({
    example: '1234567890',
    description: 'Account number',
  })
  @IsNotEmpty()
  @IsString()
  accountNumber: string;

  @ApiProperty({
    example: '1234567890',
    description: 'IBAN',
  })
  @IsNotEmpty()
  @IsString()
  IBAN: string;
}

export type PaymentType = 'partialPayment' | 'fullPayment';

export class CreatePaymentDto {
  @ApiPropertyOptional({
    example: '1234567890',
    description: 'Bank Account ID (required for bank transfers)',
  })
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional({
    example: 'Faysal Bank (Ahmed Bin Abrar)',
    description: 'Display label for the selected bank account',
  })
  @IsOptional()
  @IsString()
  bankAccountLabel?: string;

  @ApiProperty({
    example: '1234567890',
    description: 'Registration ID',
  })
  @IsNotEmpty()
  @IsString()
  registration: string;

  @ApiProperty({
    example: 'partialPayment',
    description: 'Payment Type',
  })
  @IsNotEmpty()
  @IsString()
  paymentType: PaymentType;

  @ApiProperty({
    example: 100,
    description: 'Amount',
  })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({
    example: 0,
    description: 'Wallet credits to apply (PKR)',
    required: false,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  walletAmount?: number;

  @ApiProperty({
    example: 'b7b0f5d7-2e7c-4c2a-9ab2-8e8f7c0a6a61',
    description: 'Client-generated id for wallet application idempotency',
    required: false,
  })
  @IsOptional()
  @IsString()
  walletUseId?: string;

  @ApiProperty({
    example: 0,
    description: 'Discount amount to be applied',
    required: false,
  })
  @Type(() => Number)
  @IsNumber()
  discount?: number;
}

export class RequestRefundDto {
  @ApiProperty({
    example: '1234567890',
    description: 'Registration ID',
  })
  @IsNotEmpty()
  @IsString()
  registration: string;

  @ApiProperty({
    example: '1234567890',
    description: 'Bank Details',
  })
  @IsNotEmpty()
  @IsString()
  bankDetails: string;

  @ApiProperty({
    example: '1234567890',
    description: 'Reason',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @ApiProperty({
    example: '1234567890',
    description: 'Feedback',
  })
  @IsNotEmpty()
  @IsString()
  feedback: string;

  @ApiProperty({
    example: 5,
    description: 'Rating',
  })
  @IsNotEmpty()
  @IsNumber()
  rating: number;
}

export class GetRefundsQueryDto {
  @ApiPropertyOptional({
    example: 'pending',
    enum: ['all', 'pending', 'approved_not_credited', 'credited', 'rejected'],
    description: 'Refund list grouping for admin views.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'pending', 'approved_not_credited', 'credited', 'rejected'])
  group?: 'all' | 'pending' | 'approved_not_credited' | 'credited' | 'rejected';

  @ApiPropertyOptional({ example: 1, description: '1-based page' })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, description: 'Page size' })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}
