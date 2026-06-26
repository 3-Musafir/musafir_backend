import {
  Injectable,
  InternalServerErrorException,
  BadRequestException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Rating } from './interfaces/rating.interface';



@Injectable()
export class RatingService {
  constructor(
    @InjectModel('Rating') private readonly ratingModel: Model<Rating>,
  ) { }

  async createRating(
    rating: number,
    review: string,
    registrationId: string,
    userId: string,
    flagshipId: string,
    context?: { tripSeriesId?: string; departureId?: string },
  ): Promise<string> {
    const newRating = new this.ratingModel({
      rating,
      review,
      registrationId,
      userId,
      flagshipId,
      tripSeriesId: context?.tripSeriesId,
      departureId: context?.departureId,
    });
    const savedRating = await newRating.save();
    return savedRating._id;
  }

  async getTopFiveRating(): Promise<Rating[]> {
    try {
      return this.ratingModel.find()
        .populate('userId', 'fullName email')
        .populate('flagshipId', 'tripName destination')
        .sort({ rating: -1 })
        .limit(5)
        .exec();
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch top 5 rating');
    }
  }
}
