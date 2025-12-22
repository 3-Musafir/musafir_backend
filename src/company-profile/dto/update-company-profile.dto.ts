import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanyProfileDto {
  @ApiPropertyOptional({
    example: '3Musafir',
    description: 'Public company name shown on the home page header',
  })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    example:
      'A Founder Institute certified platform making community-led travel safe and sustainable for Asians globally.',
    description: 'Short description displayed on the home page header',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
