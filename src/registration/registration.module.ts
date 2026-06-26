import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RegistrationSchema } from './schemas/registration.schema';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { MailModule } from '../mail/mail.module';
import { UserSchema } from '../user/schemas/user.schema';
import { FlagshipSchema } from '../flagship/schemas/flagship.schema';
import { PaymentSchema } from '../payment/schema/payment.schema';
import { BankAccountSchema } from '../payment/schema/bankAccount.schema';
import { StorageModule } from 'src/storage/storage.module';
import { NotificationModule } from 'src/notifications/notification.module';
import { DepartureSchema } from 'src/trip-series/schemas/departure.schema';
import { TripSeriesModule } from 'src/trip-series/trip-series.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Registration', schema: RegistrationSchema },
      { name: 'User', schema: UserSchema },
      { name: 'Flagship', schema: FlagshipSchema },
      { name: 'Departure', schema: DepartureSchema },
      { name: 'Payment', schema: PaymentSchema },
      { name: 'BankAccount', schema: BankAccountSchema },
    ]),
    MailModule,
    NotificationModule,
    StorageModule,
    TripSeriesModule,
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule { }
