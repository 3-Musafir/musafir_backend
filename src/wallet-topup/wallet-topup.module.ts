import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from 'src/mail/mail.module';
import { NotificationModule } from 'src/notifications/notification.module';
import { UserSchema } from 'src/user/schemas/user.schema';
import { WalletModule } from 'src/wallet/wallet.module';
import { TopupRequestSchema } from './schemas/topup-request.schema';
import { AdminTopupController, WalletTopupController } from './wallet-topup.controller';
import { WalletTopupService } from './wallet-topup.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'TopupRequest', schema: TopupRequestSchema },
      { name: 'User', schema: UserSchema },
    ]),
    WalletModule,
    NotificationModule,
    MailModule,
  ],
  providers: [WalletTopupService],
  controllers: [WalletTopupController, AdminTopupController],
})
export class WalletTopupModule {}

