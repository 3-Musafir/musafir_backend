import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { FlagshipSchema } from 'src/flagship/schemas/flagship.schema';
import { MailModule } from 'src/mail/mail.module';
import { NotificationModule } from 'src/notifications/notification.module';
import { RegistrationSchema } from 'src/registration/schemas/registration.schema';
import { StorageModule } from 'src/storage/storage.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { DepartureSchema } from './schemas/departure.schema';
import { TripSeriesReviewSchema } from './schemas/trip-series-review.schema';
import { TripSeriesSchema } from './schemas/trip-series.schema';
import { TripSeriesAdminController } from './trip-series.admin.controller';
import { TripSeriesController } from './trip-series.controller';
import { TripSeriesService } from './trip-series.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'TripSeries', schema: TripSeriesSchema },
      { name: 'Departure', schema: DepartureSchema },
      { name: 'TripSeriesReview', schema: TripSeriesReviewSchema },
      { name: 'Flagship', schema: FlagshipSchema },
      { name: 'Registration', schema: RegistrationSchema },
    ]),
    AuthModule,
    MailModule,
    NotificationModule,
    StorageModule,
    WalletModule,
  ],
  controllers: [TripSeriesController, TripSeriesAdminController],
  providers: [TripSeriesService],
  exports: [TripSeriesService],
})
export class TripSeriesModule {}
