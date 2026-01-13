import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './interfaces/notification.interface';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationDto, NotificationListResponse } from './dto/notification.dto';
import {
  ProfileStatus,
  describeMissingProfileFields,
} from 'src/user/profile-status.util';

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
  private readonly profileReminderKind = 'profile_completion';

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

  async ensureProfileCompletionReminder(
    userId: string,
    profileStatus?: ProfileStatus,
  ) {
    if (!userId || !profileStatus) return null;

    const missingFields =
      profileStatus.requiredFor?.general && profileStatus.requiredFor.general.length > 0
        ? profileStatus.requiredFor.general
        : profileStatus.missing || [];

    if (profileStatus.complete || missingFields.length === 0) {
      await this.resolveProfileReminder(userId);
      return null;
    }

    const missingLabels = describeMissingProfileFields(missingFields as any);
    const message =
      missingLabels.length > 0
        ? `Please complete your profile details: ${missingLabels.join(', ')}.`
        : 'Please complete your profile details.';
    const metadata = {
      kind: this.profileReminderKind,
      missingFields,
      missingFieldLabels: missingLabels,
    };

    const existing = await this.notificationModel.findOne({
      userId,
      'metadata.kind': this.profileReminderKind,
    });

    if (existing) {
      const existingMissing = Array.isArray((existing as any).metadata?.missingFields)
        ? (existing as any).metadata.missingFields
        : [];
      const needsUpdate =
        !this.arraysEqual(existingMissing, missingFields) ||
        existing.message !== message ||
        !existing.title;

      if (!needsUpdate && !existing.readAt) {
        return this.toDto(existing);
      }

      existing.title = existing.title || 'Complete your profile';
      existing.message = message;
      existing.type = existing.type || 'general';
      (existing as any).metadata = { ...(existing as any).metadata, ...metadata };
      existing.readAt = null;

      const saved = await existing.save();
      const dto = this.toDto(saved);
      this.gateway.sendNewNotification(userId, dto);
      return dto;
    }

    const created = new this.notificationModel({
      userId,
      title: 'Complete your profile',
      message,
      type: 'general',
      metadata,
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

  private async resolveProfileReminder(userId: string) {
    await this.notificationModel.updateMany(
      { userId, 'metadata.kind': this.profileReminderKind, readAt: null },
      { $set: { readAt: new Date() } },
    );
  }

  private arraysEqual(a: string[], b: string[]) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => value === b[index]);
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
