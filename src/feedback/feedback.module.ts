import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeedbackSchema } from './schemas/feedback.schema';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { RegistrationModule } from 'src/registration/registration.module';
import { RatingModule } from 'src/Rating/rating.module';
import { TripSeriesModule } from 'src/trip-series/trip-series.module';
@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Feedback', schema: FeedbackSchema }]),
    RegistrationModule,
    RatingModule,
    TripSeriesModule,
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
