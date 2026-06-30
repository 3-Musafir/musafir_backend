import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { successResponse } from 'src/constants/response';
import { User } from 'src/user/interfaces/user.interface';
import {
  CreateDepartureDto,
  CreateTripSeriesDto,
  UpdateDepartureDto,
  UpdateTripSeriesDto,
} from './dto/trip-series.dto';
import { TripSeriesService } from './trip-series.service';

@ApiTags('admin.trip-series')
@Controller('admin/trip-series')
@UseGuards(JwtAuthGuard)
@Roles('admin')
@ApiBearerAuth()
export class TripSeriesAdminController {
  constructor(private readonly tripSeriesService: TripSeriesService) {}

  @Get()
  async listTripSeries() {
    return successResponse(
      await this.tripSeriesService.getAdminTripSeries(),
      'Trip series fetched successfully.',
    );
  }

  @Post()
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'images', maxCount: 12 },
    { name: 'itineraryDayImages', maxCount: 60 },
  ]))
  async createTripSeries(
    @Body() dto: CreateTripSeriesDto,
    @UploadedFiles() uploadedFiles: {
      images?: Express.Multer.File[];
      itineraryDayImages?: Express.Multer.File[];
    },
    @GetUser() user: User,
  ) {
    return successResponse(
      await this.tripSeriesService.createTripSeries(
        dto,
        String(user._id),
        uploadedFiles?.images || [],
        uploadedFiles?.itineraryDayImages || [],
      ),
      'Trip series created successfully.',
      201,
    );
  }

  @Post('migrate-flagships')
  async migrateLegacyFlagships(
    @Body() body: { flagshipIds?: string[]; status?: 'active' | 'hidden'; limit?: number },
    @GetUser() user: User,
  ) {
    return successResponse(
      await this.tripSeriesService.migrateLegacyFlagships(String(user._id), body || {}),
      'Legacy flagships migrated successfully.',
      201,
    );
  }

  @Get('departures')
  async listDepartures(@Query('window') window?: 'past' | 'live' | 'upcoming') {
    return successResponse(
      await this.tripSeriesService.getAdminDepartures(window),
      'Departures fetched successfully.',
    );
  }

  @Get('departures/:departureId')
  async getDeparture(@Param('departureId') departureId: string) {
    return successResponse(
      await this.tripSeriesService.getDeparture(departureId, { publicOnly: false }),
      'Departure fetched successfully.',
    );
  }

  @Get(':id')
  async getTripSeries(@Param('id') id: string) {
    return successResponse(
      await this.tripSeriesService.getTripSeriesById(id),
      'Trip series fetched successfully.',
    );
  }

  @Put(':id')
  async updateTripSeries(@Param('id') id: string, @Body() dto: UpdateTripSeriesDto) {
    return successResponse(
      await this.tripSeriesService.updateTripSeries(id, dto),
      'Trip series updated successfully.',
    );
  }

  @Patch('reviews/:reviewId/hide')
  async hideReview(@Param('reviewId') reviewId: string) {
    return successResponse(
      await this.tripSeriesService.updateReview(reviewId, { status: 'hidden' }),
      'Review hidden successfully.',
    );
  }

  @Post(':id/departures')
  async createDeparture(
    @Param('id') id: string,
    @Body() dto: CreateDepartureDto,
    @GetUser() user: User,
  ) {
    return successResponse(
      await this.tripSeriesService.createDeparture(
        { ...dto, tripSeriesId: dto.tripSeriesId || id },
        String(user._id),
      ),
      'Departure created successfully.',
      201,
    );
  }

  @Get(':id/departures')
  async getDepartures(@Param('id') id: string) {
    return successResponse(
      await this.tripSeriesService.getDeparturesForSeries(id, { publicOnly: false }),
      'Departures fetched successfully.',
    );
  }

  @Put('departures/:departureId')
  async updateDeparture(
    @Param('departureId') departureId: string,
    @Body() dto: UpdateDepartureDto,
  ) {
    return successResponse(
      await this.tripSeriesService.updateDeparture(departureId, dto),
      'Departure updated successfully.',
    );
  }

  @Patch('departures/:departureId/status')
  async updateDepartureStatus(
    @Param('departureId') departureId: string,
    @Body() body: { status: string; visibility?: string; contentVersion?: string },
  ) {
    return successResponse(
      await this.tripSeriesService.updateDeparture(departureId, body as UpdateDepartureDto),
      'Departure status updated successfully.',
    );
  }

}
