import { Document } from 'mongoose';

export interface RefundRejectionReason extends Document {
  code: string;
  label: string;
  userMessage?: string;
  active: boolean;
  order?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
