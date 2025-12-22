import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { FlagshipModule } from './flagship/flagship.module';
import { TripModule } from './trip/trip.module';
import { APP_GUARD } from '@nestjs/core';
import { PermissionGuard } from './auth/guards/permission.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { RegistrationModule } from './registration/registration.module';
import { FeedbackModule } from './feedback/feedback.module';
import { FaqModule } from './FAQ/faq.module';
import { RatingModule } from './Rating/rating.module';
import { PaymentModule } from './payment/payment.module';
import { NotificationModule } from './notifications/notification.module';
import { CompanyProfileModule } from './company-profile/company-profile.module';

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  throw new Error(
    'MongoDB URI not configured. Set MONGO_URI in environment variables.',
  );
}

@Module({
  imports: [
    MongooseModule.forRoot(mongoUri),
    UserModule,
    AuthModule,
    PaymentModule,
    FlagshipModule,
    RegistrationModule,
    TripModule,
    FeedbackModule,
    FaqModule,
    RatingModule,
    NotificationModule,
    CompanyProfileModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule { }
