import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlagshipService } from './flagship.service';
import { FlagshipController } from './flagship.controller';
import { FlagshipSchema } from './schemas/flagship.schema';
import { AuthModule } from '../auth/auth.module';
import { RegistrationModule } from '../registration/registration.module';
import { MailModule } from '../mail/mail.module';
import { UserSchema } from 'src/user/schemas/user.schema';
import { RegistrationSchema } from './schemas/registration.schema';
import { PaymentSchema } from 'src/payment/schema/payment.schema';
import { ConfigService } from '@nestjs/config';
import { StorageService } from 'src/storage/storageService';
import { NotificationModule } from 'src/notifications/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Flagship', schema: FlagshipSchema },
      { name: 'User', schema: UserSchema },
      { name: 'Registration', schema: RegistrationSchema },
      { name: 'Payment', schema: PaymentSchema },
    ]),
    AuthModule,
    RegistrationModule,
    MailModule,
    NotificationModule,
  ],
  controllers: [FlagshipController],
  providers: [FlagshipService, StorageService, ConfigService],
})
export class FlagshipModule { }
