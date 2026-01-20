import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { PK_TIMEZONE } from 'src/wallet/wallet.constants';
import { WalletService } from 'src/wallet/wallet.service';
import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import { RefundSettlement } from './interfaces/refund-settlement.interface';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class RefundSettlementService {
  constructor(
    @InjectModel('RefundSettlement')
    private readonly settlementModel: Model<RefundSettlement>,
    private readonly walletService: WalletService,
  ) {}

  endOfNextCalendarYearPKT(from: Date = new Date()) {
    return dayjs(from).tz(PK_TIMEZONE).add(1, 'year').endOf('year').toDate();
  }

  async ensureSettlement(params: {
    refundId: string;
    userId: string;
    amount: number;
    status: 'pending' | 'posted';
    postedBy?: string;
    postedAt?: Date;
    metadata?: Record<string, any>;
  }) {
    const amount = Math.max(0, Math.floor(Number(params.amount) || 0));
    const refundObjectId = new mongoose.Types.ObjectId(params.refundId);

    const update: any = {
      userId: params.userId,
      amount,
      method: 'wallet_credit',
      status: params.status,
      metadata: params.metadata,
    };
    if (params.postedBy) update.postedBy = params.postedBy;
    if (params.postedAt) update.postedAt = params.postedAt;

    const settlement = await this.settlementModel
      .findOneAndUpdate(
        { refundId: refundObjectId, method: 'wallet_credit' },
        { $setOnInsert: { refundId: refundObjectId }, $set: update },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    return settlement;
  }

  async postToWallet(params: { refundId: string; userId: string; amount: number; postedBy?: string }) {
    const amount = Math.max(0, Math.floor(Number(params.amount) || 0));
    if (amount <= 0) {
      throw new BadRequestException({
        message: 'Refund amount is 0; nothing to credit.',
        code: 'refund_credit_zero',
      });
    }

    const expiresAt = this.endOfNextCalendarYearPKT();
    await this.walletService.credit({
      userId: params.userId,
      amount,
      type: 'refund_credit',
      sourceId: params.refundId,
      sourceType: 'refund_settlement',
      expiresAt,
      postedBy: params.postedBy,
      metadata: {
        sourceId: params.refundId,
        refundId: params.refundId,
        expiresAt: expiresAt.toISOString(),
      },
    });
  }

  async findByRefundIds(refundIds: string[]) {
    const ids = (refundIds || []).filter(Boolean).map((id) => new mongoose.Types.ObjectId(id));
    if (ids.length === 0) return [];
    return this.settlementModel
      .find({ refundId: { $in: ids } })
      .lean()
      .exec();
  }

  async listPending() {
    return this.settlementModel
      .find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}
