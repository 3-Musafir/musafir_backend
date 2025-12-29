import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { successResponse } from 'src/constants/response';
import { CompanyProfileService } from './company-profile.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('CompanyProfile')
@Controller('company-profile')
export class CompanyProfileController {
  constructor(private readonly companyProfileService: CompanyProfileService) { }

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get company profile for public pages' })
  @ApiOkResponse({})
  async getProfile() {
    const profile = await this.companyProfileService.getProfile();
    return successResponse(profile, 'Company profile', HttpStatus.OK);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @UseInterceptors(FileInterceptor('logo'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update company profile' })
  @ApiBearerAuth()
  @ApiOkResponse({})
  async upsertProfile(
    @Body() updateDto: UpdateCompanyProfileDto,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    const profile = await this.companyProfileService.upsertProfile(
      updateDto,
      logo,
    );
    return successResponse(profile, 'Company profile saved', HttpStatus.OK);
  }
}
