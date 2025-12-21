export class Notification {
  readonly _id: string;
  readonly userId: string;
  readonly title: string;
  readonly message: string;
  readonly type: string;
  readonly link?: string;
  readonly metadata?: Record<string, any>;
  readonly readAt?: Date | null;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}
