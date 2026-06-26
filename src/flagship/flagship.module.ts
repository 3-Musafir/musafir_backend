import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlagshipService } from './flagship.service';
import { FlagshipController } from './flagship.controller';
import { FlagshipAdminController } from './flagship.admin.controller';
import { FlagshipSchema } from './schemas/flagship.schema';
import { AuthModule } from '../auth/auth.module';
import { RegistrationModule } from '../registration/registration.module';
import { MailModule } from '../mail/mail.module';
import { UserSchema } from 'src/user/schemas/user.schema';
import { RegistrationSchema } from 'src/registration/schemas/registration.schema';
import { PaymentSchema } from 'src/payment/schema/payment.schema';
import { StorageModule } from 'src/storage/storage.module';
import { NotificationModule } from 'src/notifications/notification.module';
import { UserModule } from 'src/user/user.module';
import { RatingSchema } from 'src/Rating/schemas/rating.schema';
import { DepartureSchema } from 'src/trip-series/schemas/departure.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Flagship', schema: FlagshipSchema },
      { name: 'User', schema: UserSchema },
      { name: 'Registration', schema: RegistrationSchema },
      { name: 'Payment', schema: PaymentSchema },
      { name: 'Rating', schema: RatingSchema },
      { name: 'Departure', schema: DepartureSchema },
    ]),
    AuthModule,
    RegistrationModule,
    MailModule,
    NotificationModule,
    UserModule,
    StorageModule,
  ],
  controllers: [FlagshipController, FlagshipAdminController],
  providers: [FlagshipService],
})
export class FlagshipModule { }
