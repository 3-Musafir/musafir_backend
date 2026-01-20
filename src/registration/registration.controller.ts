import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
} from '@nestjs/swagger';
import { RegistrationService } from './registration.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { User } from 'src/user/interfaces/user.interface';
import { JwtAuthGuard } from '../auth/guards/auth.guard';

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
        return this.registrationService.createRegistration(
            createRegistrationDto,
            user._id.toString(),
          );
    }

    @UseGuards(JwtAuthGuard)
    @Get('/pastPassport')
    async getPastPassport(
        @GetUser() user: User,
    ) {
        return {
            statusCode: 200,
            message: "Past passport fetched successfully",
            data: await this.registrationService.getPastPassport(user._id.toString())
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('/upcomingPassport')
    async getUpcomingPassport(
        @GetUser() user: User,
    ) {
        return {
            statusCode: 200,
            message: "Upcoming passport fetched successfully",
            data: await this.registrationService.getUpcomingPassport(user._id.toString())
        }
    }

    @UseGuards(JwtAuthGuard)
    @Get('/getRegistrationById/:registrationId')
    async getRegistrationById(
        @Param('registrationId') registrationId: string,
    ) {
        return {
            statusCode: 200,
            message: "Registration fetched successfully",
            data: await this.registrationService.getRegistrationById(registrationId)
        }
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
} 
