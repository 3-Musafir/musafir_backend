import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminAttendanceDto {
  @ApiProperty({ example: 'present', description: 'Attendance status' })
  @IsNotEmpty()
  @IsIn(['present', 'absent'])
  status: 'present' | 'absent';

  @ApiPropertyOptional({
    example: 'manual_checkin',
    description: 'Source of attendance update',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'If true, payment is deferred (pay later)',
  })
  @IsOptional()
  @IsBoolean()
  deferPayment?: boolean;
}
