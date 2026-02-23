import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { User } from 'src/user/interfaces/user.interface';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/createFeedback.dto';

@ApiTags('Feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
  ) { }

  @UseGuards(JwtAuthGuard)
  @Post('/:registrationId')
  async createFeedback(
    @GetUser() user: User,
    @Param('registrationId') registrationId: string,
    @Body() feedback: CreateFeedbackDto,
  ) {
    if (!user?._id) {
      throw new UnauthorizedException('Authentication required.');
    }
    return {
      statusCode: 200,
      message: "Feedback submitted successfully",
      data: await this.feedbackService.createFeedback(feedback, registrationId, user)
    }
  }
}