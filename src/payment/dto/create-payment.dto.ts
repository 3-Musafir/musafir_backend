import { IsMongoId, IsNotEmpty, IsOptional, IsString, IsNumber, IsDate } from 'class-validator';

export class CreatePaymentDTO {
    @IsMongoId()
    @IsNotEmpty()
    registration: string;

    @IsMongoId()
    @IsOptional()
    bankAccount?: string;

    @IsOptional()
    @IsString()
    bankAccountLabel?: string;

    @IsString()
    @IsNotEmpty()
    paymentType: string;

    @IsNumber()
    @IsNotEmpty()
    amount: number;

    @IsNumber()
    @IsOptional()
    discount: number;
}
