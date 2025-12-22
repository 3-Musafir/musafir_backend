export interface NotificationDto {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  readAt?: Date | null;
}

export interface NotificationListResponse {
  items: NotificationDto[];
  unreadCount: number;
}
