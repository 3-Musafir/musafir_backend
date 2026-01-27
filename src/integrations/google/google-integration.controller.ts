import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { GoogleSheetsService } from './google-sheets.service';

interface ConnectSheetDto {
  flagshipId: string;
  sheetId: string;
  sheetName?: string;
}

@Controller('integrations')
@UseGuards(JwtAuthGuard)
@Roles('admin')
@ApiBearerAuth()
export class GoogleIntegrationController {
  constructor(private readonly sheetsService: GoogleSheetsService) {}

  @Post('google-sheets/connect')
  async connectSheet(
    @Body() body: ConnectSheetDto,
    @GetUser() user: any,
  ): Promise<any> {
    const adminId = user?._id?.toString();
    if (!adminId) {
      return {
        message: 'Authentication required',
      };
    }
    return this.sheetsService.connectSheet(
      adminId,
      body.flagshipId,
      body.sheetId,
      body.sheetName,
    );
  }

  @Delete('google-sheets/disconnect')
  async disconnectSheet(@Query('flagshipId') flagshipId: string): Promise<any> {
    return this.sheetsService.disconnectSheet(flagshipId);
  }

  @Get('google-sheets/status')
  async sheetStatus(@Query('flagshipId') flagshipId: string) {
    return this.sheetsService.getSheetStatus(flagshipId);
  }
}
