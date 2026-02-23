import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    UseGuards,
    UnauthorizedException,
} from '@nestjs/common';
import {
    ApiTags,
} from '@nestjs/swagger';
import { RegistrationService } from './registration.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { User } from 'src/user/interfaces/user.interface';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { AdminDeleteRegistrationDto } from './dto/admin-delete-registration.dto';

@ApiTags('Registration')
@Controller('registration')
export class RegistrationController {
    constructor(
        private readonly registrationService: RegistrationService,
    ) { }

    @Post('/')
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.CREATED)
    async register(
        @GetUser() user: User,
        @Body() createRegistrationDto: CreateRegistrationDto,
    ) {
        const userId = user?._id?.toString();
        if (!userId) {
            throw new UnauthorizedException('Authentication required.');
        }
        return this.registrationService.createRegistration(
            createRegistrationDto,
            userId,
          );
    }

    @UseGuards(JwtAuthGuard)
    @Get('/pastPassport')
    async getPastPassport(
        @GetUser() user: User,
    ) {
        const userId = user?._id?.toString();
        if (!userId) {
            throw new UnauthorizedException('Authentication required.');
        }
        return {
            statusCode: 200,
            message: "Past passport fetched successfully",
            data: await this.registrationService.getPastPassport(userId)
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('/upcomingPassport')
    async getUpcomingPassport(
        @GetUser() user: User,
    ) {
        const userId = user?._id?.toString();
        if (!userId) {
            throw new UnauthorizedException('Authentication required.');
        }
        return {
            statusCode: 200,
            message: "Upcoming passport fetched successfully",
            data: await this.registrationService.getUpcomingPassport(userId)
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('/getRegistrationById/:registrationId')
    async getRegistrationById(
        @GetUser() user: User,
        @Param('registrationId') registrationId: string,
    ) {
        const userId = user?._id?.toString();
        if (!userId) {
            throw new UnauthorizedException('Authentication required.');
        }
        return {
            statusCode: 200,
            message: "Registration fetched successfully",
            data: await this.registrationService.getRegistrationById(registrationId, user)
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('/group-link-status/:registrationId')
    async getGroupLinkStatus(
      @Param('registrationId') registrationId: string,
    ) {
      return {
        statusCode: 200,
        message: 'Group link status fetched successfully',
        data: await this.registrationService.getGroupLinkStatus(registrationId),
      };
    }

    @UseGuards(JwtAuthGuard)
    @Get('/pending-group-invite/:flagshipId')
    async getPendingGroupInvite(
      @GetUser() user: User,
      @Param('flagshipId') flagshipId: string,
    ) {
      return {
        statusCode: 200,
        message: 'Pending group invite fetched successfully',
        data: await this.registrationService.getPendingGroupInvite(flagshipId, user),
      };
    }

    @UseGuards(JwtAuthGuard)
    @Post('/reEvaluateRequestToJury')
    async sendReEvaluateRequestToJury(
      @GetUser() user: User,
      @Body() body: { registrationId: string }
    ) {
      return {
        statusCode: 200,
        message: await this.registrationService.sendReEvaluateRequestToJury(body.registrationId, user)
      }
    }

    @UseGuards(JwtAuthGuard)
    @Post('/:registrationId/cancel')
    async cancelSeat(
      @GetUser() user: User,
      @Param('registrationId') registrationId: string,
    ) {
      return {
        statusCode: 200,
        message: 'Seat cancelled successfully',
        data: await this.registrationService.cancelSeat(registrationId, user),
      };
    }

    @UseGuards(JwtAuthGuard)
    @Post('/waitlist/offer/:registrationId/accept')
    async acceptWaitlistOffer(
      @GetUser() user: User,
      @Param('registrationId') registrationId: string,
    ) {
      return {
        statusCode: 200,
        message: 'Waitlist offer accepted.',
        data: await this.registrationService.respondWaitlistOffer(
          registrationId,
          user,
          'accepted',
        ),
      };
    }

    @UseGuards(JwtAuthGuard)
    @Post('/waitlist/offer/:registrationId/decline')
    async declineWaitlistOffer(
      @GetUser() user: User,
      @Param('registrationId') registrationId: string,
    ) {
      return {
        statusCode: 200,
        message: 'Waitlist offer declined.',
        data: await this.registrationService.respondWaitlistOffer(
          registrationId,
          user,
          'declined',
        ),
      };
    }

    @UseGuards(JwtAuthGuard)
    @Roles('admin')
    @Post('/waitlist/process/:flagshipId')
    async processWaitlist(
      @Param('flagshipId') flagshipId: string,
    ) {
      return {
        statusCode: 200,
        message: 'Waitlist processed.',
        data: await this.registrationService.processWaitlistForFlagship(flagshipId),
      };
    }
  
    @UseGuards(JwtAuthGuard)
    @Roles('admin')
    @Delete('/admin/:registrationId')
    async deleteRegistrationAsAdmin(
      @Param('registrationId') registrationId: string,
      @Body() body: AdminDeleteRegistrationDto,
    ) {
      const data = await this.registrationService.deleteRegistrationAsAdmin(
        registrationId,
        body?.reason,
      );
      return {
        statusCode: 200,
        message: 'Registration deleted successfully.',
        data,
      };
    }
} 
