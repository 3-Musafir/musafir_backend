import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './interfaces/notification.interface';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationDto, NotificationListResponse } from './dto/notification.dto';

interface CreateNotificationPayload {
  title: string;
  message: string;
  type?: string;
  link?: string;
  metadata?: Record<string, any>;
}

interface ListQuery {
  page?: number;
  limit?: number;
  read?: boolean;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel('Notification')
    private readonly notificationModel: Model<Notification>,
    private readonly gateway: NotificationsGateway,
  ) {}

  async createForUsers(userIds: string[], payload: CreateNotificationPayload) {
    if (!userIds || userIds.length === 0) return [];

    const docs = userIds.map((userId) => ({
      userId,
      title: payload.title,
      message: payload.message,
      type: payload.type || 'general',
      link: payload.link,
      metadata: payload.metadata,
    }));
    const created = await this.notificationModel.insertMany(docs);

    const dtoList = created.map((doc) => {
      const dto = this.toDto(doc);
      this.gateway.sendNewNotification(String((doc as any).userId), dto);
      return dto;
    });

    return dtoList;
  }

  async createForUser(userId: string, payload: CreateNotificationPayload) {
    const created = new this.notificationModel({
      userId,
      title: payload.title,
      message: payload.message,
      type: payload.type || 'general',
      link: payload.link,
      metadata: payload.metadata,
    });
    const saved = await created.save();
    const dto = this.toDto(saved);
    this.gateway.sendNewNotification(userId, dto);
    return dto;
  }

  async listForUser(userId: string, query: ListQuery = {}): Promise<NotificationListResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(50, query.limit || 20));
    const filter: Record<string, any> = { userId };
    if (typeof query.read === 'boolean') {
      filter.readAt = query.read ? { $ne: null } : null;
    }

    const [items, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments({ userId, readAt: null }),
    ]);

    return {
      items: items.map((item) => this.toDto(item)),
      unreadCount,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    const dto = this.toDto(notification);
    this.gateway.sendRead(userId, dto.id);
    return dto;
  }

  async markAllRead(userId: string) {
    const res = await this.notificationModel.updateMany(
      { userId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    this.gateway.sendReadAll(userId);
    return { updated: true, matched: res.matchedCount ?? res.modifiedCount };
  }

  private toDto(notification: any): NotificationDto {
    return {
      id: notification._id.toString(),
      title: notification.title,
      message: notification.message,
      type: notification.type,
      link: notification.link,
      metadata: notification.metadata,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    };
  }
}
