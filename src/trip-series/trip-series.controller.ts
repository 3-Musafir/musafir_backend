import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/auth/decorators/public.decorator';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { successResponse } from 'src/constants/response';
import { User } from 'src/user/interfaces/user.interface';
import { DepartureFilterDto, SubmitTripSeriesReviewDto, TripSeriesFilterDto } from './dto/trip-series.dto';
import { TripSeriesService } from './trip-series.service';

@ApiTags('Trip Series')
@Controller('trip-series')
export class TripSeriesController {
  constructor(private readonly tripSeriesService: TripSeriesService) {}

  @Public()
  @Get()
  async getTripSeries(@Query() filters: TripSeriesFilterDto) {
    return successResponse(
      await this.tripSeriesService.getPublicTripSeries(filters),
      'Trip series fetched successfully.',
    );
  }

  @Public()
  @Get('last-minute')
  async getLastMinute(@Query('days') days?: string) {
    return successResponse(
      await this.tripSeriesService.getLastMinuteDepartures(Number(days || 21)),
      'Last minute departures fetched successfully.',
    );
  }

  @Public()
  @Get('by-flagship/:flagshipId')
  async getTripSeriesByFlagship(@Param('flagshipId') flagshipId: string) {
    return successResponse(
      await this.tripSeriesService.getTripSeriesByLegacyFlagship(flagshipId, { publicOnly: true }),
      'Trip series fetched successfully.',
    );
  }

  @Public()
  @Get('departures')
  async getDepartures(@Query() filters: DepartureFilterDto) {
    return successResponse(
      await this.tripSeriesService.getPublicDepartures(filters),
      'Departures fetched successfully.',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('departures/:id/group-chat')
  async getDepartureGroupAccess(
    @Param('id') id: string,
    @GetUser() user: User,
  ) {
    if (!user?._id) {
      throw new UnauthorizedException('Authentication required.');
    }
    return successResponse(
      await this.tripSeriesService.getDepartureGroupAccess(id, String(user._id)),
      'Departure group chat access fetched successfully.',
    );
  }

  @Public()
  @Get('departures/:id')
  async getDeparture(@Param('id') id: string) {
    return successResponse(
      await this.tripSeriesService.getDeparture(id, { publicOnly: true }),
      'Departure fetched successfully.',
    );
  }

  @Public()
  @Get(':slug/departures')
  async getDeparturesBySlug(@Param('slug') slug: string) {
    return successResponse(
      await this.tripSeriesService.getDeparturesBySlug(slug, { publicOnly: true }),
      'Departures fetched successfully.',
    );
  }

  @Public()
  @Get(':slug/reviews')
  async getReviewsBySlug(@Param('slug') slug: string) {
    const series = await this.tripSeriesService.getTripSeriesBySlug(slug);
    return successResponse(series.reviews || [], 'Trip series reviews fetched successfully.');
  }

  @UseGuards(JwtAuthGuard)
  @Post(':slug/reviews')
  @UseInterceptors(FilesInterceptor('media', 8))
  async createReviewBySlug(
    @Param('slug') slug: string,
    @Body() dto: SubmitTripSeriesReviewDto,
    @UploadedFiles() media: Express.Multer.File[],
    @GetUser() user: User,
  ) {
    if (!user?._id) {
      throw new UnauthorizedException('Authentication required.');
    }
    return successResponse(
      await this.tripSeriesService.createUserReviewForSeriesSlug(
        slug,
        dto,
        String(user._id),
        media || [],
      ),
      'Review submitted successfully.',
      201,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':slug/reviews/:reviewId/helpful')
  async markReviewHelpful(
    @Param('slug') slug: string,
    @Param('reviewId') reviewId: string,
    @GetUser() user: User,
  ) {
    if (!user?._id) {
      throw new UnauthorizedException('Authentication required.');
    }
    return successResponse(
      await this.tripSeriesService.markReviewHelpful(slug, reviewId, String(user._id)),
      'Review marked helpful.',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':slug/review-eligibility')
  async getReviewEligibility(
    @Param('slug') slug: string,
    @GetUser() user: User,
  ) {
    if (!user?._id) {
      throw new UnauthorizedException('Authentication required.');
    }
    return successResponse(
      await this.tripSeriesService.getUserReviewEligibilityForSeriesSlug(slug, String(user._id)),
      'Review eligibility fetched successfully.',
    );
  }

  @Public()
  @Get(':slug')
  async getTripSeriesBySlug(@Param('slug') slug: string) {
    return successResponse(
      await this.tripSeriesService.getTripSeriesBySlug(slug),
      'Trip series fetched successfully.',
    );
  }
}
