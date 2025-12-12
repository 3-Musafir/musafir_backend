import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class TripQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsMongoId()
  @IsNotEmpty()
  flagshipId: string;
}


