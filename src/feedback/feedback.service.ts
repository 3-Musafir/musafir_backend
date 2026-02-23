import {
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback } from './interfaces/feedback.interface';
import { CreateFeedbackDto } from './dto/createFeedback.dto';
import { RegistrationService } from 'src/registration/registration.service';
import { RatingService } from 'src/Rating/rating.service';
import { User } from 'src/user/interfaces/user.interface';


@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel('Feedback') private readonly feedbackModel: Model<Feedback>,
    @Inject(RegistrationService) private readonly registrationService: RegistrationService,
    private readonly ratingService: RatingService,
  ) { }

  async createFeedback(feedback: CreateFeedbackDto, registrationId: string, user: User): Promise<{ message: string }> {
    try {
      if (!registrationId) {
        throw new BadRequestException('Registration ID is required');
      }

      const registration = await this.registrationService.getRegistrationById(registrationId, user);
      if (!registration) {
        throw new NotFoundException(`Registration with ID ${registrationId} not found`);
      }

      const newFeedback = new this.feedbackModel(feedback);
      await newFeedback.save();

      const flagshipId = typeof registration.flagshipId === 'object' ?
        registration.flagshipId._id : registration.flagshipId;

      const ratingId = await this.ratingService.createRating(
        feedback.rating,
        feedback.likeAboutTrip,
        registrationId,
        registration.userId,
        flagshipId
      );

      registration.ratingId = ratingId;
      await registration.save();

      return {
        message: "Feedback created successfully."
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create feedback. Please try again later,', error.message);
    }
  }
}
