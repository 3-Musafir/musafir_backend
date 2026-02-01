import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsMongoId, IsNotEmpty, IsOptional, IsString, IsNumber, IsEmail } from 'class-validator';

export class CreateRegistrationDto {
    @IsMongoId()
    @IsNotEmpty()
    flagshipId: string;

    @IsMongoId()
    @IsOptional()
    userId: string;

    @IsMongoId()
    @IsOptional()
    paymentId?: string; 
   
    @IsString()
    @IsOptional()
    joiningFromCity: string;

    @IsString()
    @IsOptional()
    tier: string;

    @IsString()
    @IsOptional()
    bedPreference: string;

    @IsString()
    @IsOptional()
    roomSharing: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            return value
                .split(/[,\n]+/)
                .map((entry) => entry.trim())
                .filter(Boolean);
        }
        return [];
    })
    @IsArray()
    @IsEmail({}, { each: true })
    @IsString({ each: true })
    groupMembers: string[];

    @IsString()
    @IsOptional()
    expectations: string;

    @IsString()
    @IsOptional()
    tripType: string;

    @IsNumber()
    @IsOptional()
    price: number;

    @IsNumber()
    @IsOptional()
    amountDue: number = 0;

    @IsBoolean()
    isPaid: boolean = false;
}
