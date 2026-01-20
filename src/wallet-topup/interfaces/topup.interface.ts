import { Document, Types } from 'mongoose';

export interface TopupRequest extends Document {
  userId: Types.ObjectId;
  packageAmount: number;
  status: 'pending' | 'processed' | 'rejected';
  whatsappTo: string;
  messageTemplate: string;
  processedAt?: Date;
  processedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

