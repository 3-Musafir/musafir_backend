import { Document } from 'mongoose';

export interface CompanyProfile {
  _id?: string;
  name: string;
  description: string;
  logoKey?: string;
  logoUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CompanyProfileDocument = CompanyProfile & Document;
