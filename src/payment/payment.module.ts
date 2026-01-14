import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { PaymentSchema } from 'src/payment/schema/payment.schema';
import { BankAccountSchema } from './schema/bankAccount.schema';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { StorageService } from 'src/storage/storageService';
import { UserSchema } from 'src/user/schemas/user.schema';
import { UserModule } from '../user/user.module';
import { FlagshipSchema } from 'src/flagship/schemas/flagship.schema';
import { ConfigService } from '@nestjs/config';
import { RefundSchema } from './schema/refund.schema';
import { RegistrationSchema } from 'src/registration/schemas/registration.schema';
import { MailModule } from 'src/mail/mail.module';
import { NotificationModule } from 'src/notifications/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'BankAccount', schema: BankAccountSchema },
      { name: 'Payment', schema: PaymentSchema },
      { name: 'User', schema: UserSchema },
      { name: 'Flagship', schema: FlagshipSchema },
      { name: 'Refund', schema: RefundSchema },
      { name: 'Registration', schema: RegistrationSchema },
    ]),
    AuthModule,
    UserModule,
    MailModule,
    NotificationModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, StorageService, ConfigService],
  exports: [PaymentService],
})
export class PaymentModule {}
