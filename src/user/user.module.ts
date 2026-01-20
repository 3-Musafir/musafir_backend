import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './schemas/user.schema';
import { RegistrationSchema } from '../registration/schemas/registration.schema';
import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { StorageService } from 'src/storage/storageService';
import { ConfigService } from '@nestjs/config';
import { NotificationModule } from 'src/notifications/notification.module';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'Registration', schema: RegistrationSchema }
    ]),
    AuthModule,
    MailModule,
    NotificationModule,
    WalletModule,
  ],
  controllers: [UserController],
  providers: [UserService, StorageService, ConfigService],
  exports: [UserService],
})
export class UserModule { }
