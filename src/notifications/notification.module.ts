import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationSchema } from './notification.schema';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationsGateway } from './notifications.gateway';
import { JwtModule } from '@nestjs/jwt';
import { JwtWsGuard } from 'src/auth/guards/jwt-ws.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Notification', schema: NotificationSchema }]),
    JwtModule.register({}),
  ],
  providers: [NotificationService, NotificationsGateway, JwtWsGuard],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
