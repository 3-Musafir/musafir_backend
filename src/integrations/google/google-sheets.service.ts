import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Document, Model, Types } from 'mongoose';

interface GoogleSheetRowPayload {
  registration?: any;
  payment?: any;
  metadata?: Record<string, unknown>;
}

  interface GoogleSheetCredentialDoc extends Document {
    adminId: Types.ObjectId;
    flagshipId: Types.ObjectId;
    sheetId: string;
    sheetName?: string;
    status: 'connected' | 'disconnected' | 'error';
    lastSyncedAt?: Date;
    syncError?: string;
  }

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);

  constructor(
    @InjectModel('GoogleSheetCredential')
    private readonly credentialModel: Model<GoogleSheetCredentialDoc>,
    @InjectModel('GoogleSheetRow') private readonly rowModel: Model<any>,
  ) {}

  async connectSheet(
    adminId: string,
    flagshipId: string,
    sheetId: string,
    sheetName?: string,
  ) {
    const flagshipObjectId = new Types.ObjectId(flagshipId);
    const existing = await this.credentialModel.findOne({
      flagshipId: flagshipObjectId,
    });
      if (existing) {
        existing.adminId = new Types.ObjectId(adminId);
        existing.sheetId = sheetId;
        existing.sheetName = sheetName || '';
        existing.status = 'connected';
        existing.syncError = '';
        await existing.save();
        return existing.toObject();
      }
      const credential = new this.credentialModel({
        adminId: new Types.ObjectId(adminId),
        flagshipId: flagshipObjectId,
        sheetId,
        sheetName: sheetName || '',
        status: 'connected',
      });
      return credential.save();
  }

  async disconnectSheet(flagshipId: string) {
    const flagshipObjectId = new Types.ObjectId(flagshipId);
    const existing = await this.credentialModel.findOne({ flagshipId: flagshipObjectId });
    if (!existing) return null;
    existing.status = 'disconnected';
    existing.syncError = '';
    await existing.save();
    return existing.toObject();
  }

  async getSheetStatus(flagshipId: string) {
    const flagshipObjectId = new Types.ObjectId(flagshipId);
    const credential = await this.credentialModel
      .findOne({ flagshipId: flagshipObjectId })
      .lean<GoogleSheetCredentialDoc>()
      .exec();
    if (!credential) {
      return {
        connected: false,
        sheetId: null,
        sheetName: null,
        lastSyncedAt: null,
        syncError: null,
      };
    }
    return {
      connected: credential.status === 'connected',
      sheetId: credential.sheetId,
      sheetName: credential.sheetName,
      lastSyncedAt: credential.lastSyncedAt,
      syncError: credential.syncError,
    };
  }

  async appendRegistrationRow(flagshipId: string, payload: GoogleSheetRowPayload) {
    return this.appendRow(flagshipId, 'registration', payload);
  }

  async appendPaymentRow(flagshipId: string, payload: GoogleSheetRowPayload) {
    return this.appendRow(flagshipId, 'payment', payload);
  }

  private async appendRow(
    flagshipId: string,
    rowType: 'registration' | 'payment',
    payload: GoogleSheetRowPayload,
  ) {
    try {
      const credential = await this.credentialModel.findOne({
        flagshipId: new Types.ObjectId(flagshipId),
        status: 'connected',
      });
      if (!credential) {
        this.logger.verbose(
          `No Google Sheet linked for flagship ${flagshipId}. Skipping sync.`,
        );
        return null;
      }
      const row = new this.rowModel({
        flagshipId: new Types.ObjectId(flagshipId),
        rowType,
        payload,
        syncedAt: new Date(),
      });
      await row.save();
      credential.lastSyncedAt = new Date();
      credential.syncError = '';
      await credential.save();
      this.logger.verbose(
        `Enqueued Google Sheet row for flagship ${flagshipId}, type ${rowType}.`,
      );
      return row.toObject();
    } catch (error) {
      this.logger.error('Failed to append Google Sheet row', error);
      await this.markSyncError(flagshipId, String(error));
      throw error;
    }
  }

  private async markSyncError(flagshipId: string, error: string) {
    const credential = await this.credentialModel.findOne({
      flagshipId: new Types.ObjectId(flagshipId),
    });
    if (!credential) return;
    credential.status = 'error';
    credential.syncError = error;
    await credential.save();
  }
}
