import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,    
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { successResponse } from '../constants/response';
import { CreateFlagshipDto } from './dto/create-flagship.dto';
import { UpdateFlagshipDto } from './dto/update-flagship.dto';
import { FlagshipService } from './flagship.service';

import { FileInterceptor, FilesInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard';
import { AuthenticatedRequest } from '../user/interfaces/authenticated-request';
import { User } from 'src/user/interfaces/user.interface';
import { FlagshipFilterDto } from './dto/get-flagship.dto';
import { TripQueryDto } from './dto/trip-query.dto';
import { Flagship } from './interfaces/flagship.interface';

const parsePagination = (limit?: string, page?: string) => {
  const parsedLimit = limit ? Number(limit) : undefined;
  const parsedPage = page ? Number(page) : undefined;

  return {
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : undefined,
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : undefined,
  };
};

@ApiTags('Flagship')
@Controller('flagship')
export class FlagshipController {
  constructor(private readonly flagshipService: FlagshipService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new flagship trip' })
  @ApiResponse({
    status: 201,
    description: 'Flagship trip created successfully.',
  })
  @ApiResponse({ status: 400, description: 'Invalid data provided.' })
  @ApiBearerAuth()
  async create(
    @Body() createFlagshipDto: CreateFlagshipDto,
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      createFlagshipDto.created_By = req.user._id.toString();
      const flagShip = await this.flagshipService.create(createFlagshipDto);
      return successResponse(flagShip, 'Flagship Created', 201);
    } catch (error) {
      // Return detailed error message for validation errors
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((err: any) => err.message);
        throw new BadRequestException(messages.join(', '));
      }
      throw error;
    }
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get all flagships with filtering options' })
  @ApiResponse({
    status: 200,
    description: 'Flagship records',
    type: [Flagship],
  })
  async getFlagships(
    @GetUser() user: User,
    @Query() filterDto: FlagshipFilterDto,
  ): Promise<any> {
    const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');

    // Non-admin callers should only be able to browse upcoming, public, published flagships
    if (!isAdmin) {
      filterDto.visibility = 'public';
      filterDto.status = 'published';
      filterDto.includePast = false;
      (filterDto as any).endDate = { $gte: new Date() };
    }

    const excludeRegisteredUserId =
      !isAdmin && user?._id ? user._id.toString() : undefined;
    const flagships = await this.flagshipService.getAllFlagships(filterDto, {
      excludeRegisteredUserId,
    });
    return successResponse(flagships, 'Flagship Data', HttpStatus.OK);
  }

  @Public()
  @Get('getByID/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get one flagships' })
  @ApiOkResponse({})
  findOne(@GetUser() user: User, @Param('id') id: string) {
    const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');
    return this.flagshipService.findOne(id, {
      restrictToPublishedPublic: !isAdmin,
    });
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'files', maxCount: 10 },
      { name: 'detailedPlanDoc', maxCount: 1 },
    ])
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update flagship pricing details' })
  @ApiResponse({ status: 200, description: 'Flagship updated successfully.' })
  @ApiResponse({ status: 404, description: 'Flagship not found.' })
  @ApiBearerAuth()
  async update(
    @Param('id') id: string,
    @Body() updateFlagshipDto: UpdateFlagshipDto,
    @UploadedFiles() uploadedFiles: { files?: Express.Multer.File[], detailedPlanDoc?: Express.Multer.File[] },
  ) {
    if (uploadedFiles) {
      if (uploadedFiles.files && uploadedFiles.files.length > 0) {
        updateFlagshipDto.files = uploadedFiles.files;
      }
      if (uploadedFiles.detailedPlanDoc && uploadedFiles.detailedPlanDoc[0]) {
        updateFlagshipDto.detailedPlanDoc = uploadedFiles.detailedPlanDoc[0];
      }
    }

    const flagShip = await this.flagshipService.updateFlagship(
      id,
      updateFlagshipDto,
    );
    return successResponse(flagShip, 'Flagship Updated', HttpStatus.OK);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a flagships' })
  @ApiOkResponse({})
  @ApiBearerAuth()
  remove(@Param('id') id: string) {
    return this.flagshipService.remove(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/tripQuery')
  async sendTripQuery(
    @GetUser() user: User,
    @Body() tripQuery: TripQueryDto,
  ) {
    return {
      statusCode: 200,
      message: await this.flagshipService.sendTripQuery(
        tripQuery.query,
        tripQuery.flagshipId,
        user,
      ),
    }
  }

  @Get('registered/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get registered users for a flagship' })
  @ApiOkResponse({})
  findRegisteredUsers(
    @Param('id') id: string,
    @Query('search') search: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('rejectedOnly') rejectedOnly?: string,
    @Query('excludeVerificationStatus') excludeVerificationStatus?: string,
  ) {
    const pagination = parsePagination(limit, page);
    const filters = {
      ...pagination,
      verificationStatus: verificationStatus || 'all',
      rejectedOnly: rejectedOnly === 'true',
      excludeVerificationStatus,
    };
    return this.flagshipService.findRegisteredUsers(id, search, filters);
  }

  @Get('pending-verification/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get pending verification users for a flagship' })
  @ApiOkResponse({})
  findPendingVerificationUsers(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const pagination = parsePagination(limit, page);
    return this.flagshipService.findPendingVerificationUsers(id, pagination);
  }

  @Get('pending-payment-verification/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get payments pending approval for a flagship' })
  @ApiOkResponse({})
  findPendingPaymentVerifications(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('paymentType') paymentType?: string,
  ) {
    const pagination = parsePagination(limit, page);
    return this.flagshipService.findPendingPaymentVerifications(id, {
      ...pagination,
      paymentType,
    });
  }

  @Get('paid/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get paid users for a flagship' })
  @ApiOkResponse({})
  findPaidUsers(
    @Param('id') id: string,
    @Query('paymentType') paymentType: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const pagination = parsePagination(limit, page);
    return this.flagshipService.findPaidUsers(id, paymentType, pagination);
  }

  @Get('registeration-stats/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get registeration stats for a flagship' })
  @ApiOkResponse({})
  getRegisterationStats(@Param('id') id: string) {
    return this.flagshipService.getRegisterationStats(id);
  }

  @Get('payment-stats/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get payment stats for a flagship' })
  @ApiOkResponse({})
  getPaymentStats(@Param('id') id: string) {
    return this.flagshipService.gePaymentStats(id);
  }

  @Get('registration/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get registration by ID' })
  @ApiOkResponse({})
  getRegistrationByID(@Param('id') id: string) {
    return this.flagshipService.getRegistrationByID(id);
  }

  @Patch('approve-registration/:registerationID')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'approve registeration' })
  @ApiOkResponse({})
  approveRegisteration(
    @Param('registerationID') id: string,
    @Body('comment') comment: string,
  ) {
    return this.flagshipService.approveRegisteration(id, comment);
  }

  @Patch('reject-registration/:registerationID')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'reject registeration' })
  @ApiOkResponse({})
  rejectRegisteration(
    @Param('registerationID') id: string,
    @Body('comment') comment: string,
  ) {
    return this.flagshipService.rejectRegisteration(id, comment);
  }

  @Patch('didnt-pick/:registerationID')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "mark registration as didntPick" })
  @ApiOkResponse({})
  didntPickRegistration(@Param('registerationID') id: string, @Body('comment') comment: string) {
    return this.flagshipService.didntPickRegistration(id, comment);
  }

  @Patch('verify-user/:userID')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'verify user' })
  @ApiOkResponse({})
  verifyUser(@Param('userID') id: string, @Body('comment') comment: string) {
    return this.flagshipService.verifyUser(id, comment);
  }

  @Patch('reject-verification/:userID')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'reject registeration' })
  @ApiOkResponse({})
  rejectVerification(
    @Param('userID') id: string,
    @Body('comment') comment: string,
  ) {
    return this.flagshipService.rejectVerification(id, comment);
  }

  @Get('past-trips')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get past trips' })
  @ApiOkResponse({})
  @ApiBearerAuth()
  getPastTrips() {
    return this.flagshipService.getPastTrips();
  }

  @Get('live-trips')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get live trips' })
  @ApiOkResponse({})
  @ApiBearerAuth()
  getLiveTrips() {
    return this.flagshipService.getLiveTrips();
  }

  @Get('upcoming-trips')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get upcoming trips' })
  @ApiOkResponse({})
  @ApiBearerAuth()
  getUpcomingTrips() {
    return this.flagshipService.getUpcomingTrips();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get flagship by id (admin)' })
  @ApiOkResponse({})
  @ApiBearerAuth()
  getFlagshipById(@Param('id') id: string) {
    return this.flagshipService.findOne(id);
  }
}
