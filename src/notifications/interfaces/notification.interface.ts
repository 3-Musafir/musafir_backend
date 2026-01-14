export class Notification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  metadata?: Record<string, any>;
  readAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
