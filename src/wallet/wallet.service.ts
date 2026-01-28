import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WalletBalance, WalletTransaction } from './interfaces/wallet.interface';
import { User } from 'src/user/interfaces/user.interface';
import { WALLET_CURRENCY } from './wallet.constants';

export const WALLET_TX_IDEMPOTENT_MARKER = '__walletTxIdempotent';

export function isWalletTxIdempotent(tx: any): boolean {
  return Boolean(tx && typeof tx === 'object' && (tx as any)[WALLET_TX_IDEMPOTENT_MARKER]);
}

function markWalletTxIdempotent<T>(tx: T): T {
  if (!tx || typeof tx !== 'object') return tx;
  if ((tx as any)[WALLET_TX_IDEMPOTENT_MARKER]) return tx;
  try {
    Object.defineProperty(tx as any, WALLET_TX_IDEMPOTENT_MARKER, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Best-effort marker for downstream idempotency handling.
  }
  return tx;
}

@Injectable()
export class WalletService {
  constructor(
    @InjectModel('WalletBalance')
    private readonly walletBalanceModel: Model<WalletBalance>,
    @InjectModel('WalletTransaction')
    private readonly walletTransactionModel: Model<WalletTransaction>,
    @InjectModel('User')
    private readonly userModel: Model<User>,
  ) {}

  async getBalance(userId: string): Promise<{ balance: number }> {
    const doc = await this.walletBalanceModel
      .findOne({ userId })
      .select('balance')
      .lean()
      .exec();
    return { balance: doc?.balance ?? 0 };
  }

  async listTransactions(
    userId: string,
    options?: { limit?: number; page?: number; cursor?: string; type?: string },
  ) {
    const limit = Math.max(1, Math.min(100, Number(options?.limit) || 20));
    const page = options?.page ? Math.max(1, Number(options.page)) : undefined;
    const cursor = options?.cursor;
    const type = options?.type;

    const filter: any = { userId };
    if (type) filter.type = type;

    // Prefer keyset pagination for performance.
    if (cursor) {
      filter._id = { $lt: cursor };
      const transactions = await this.walletTransactionModel
        .find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean()
        .exec();

      const hasMore = transactions.length > limit;
      if (hasMore) transactions.pop();

      return {
        transactions,
        nextCursor: hasMore
          ? transactions[transactions.length - 1]?._id?.toString()
          : null,
      };
    }

    const skip = page ? (page - 1) * limit : 0;
    const transactions = await this.walletTransactionModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    return { transactions, page: page || 1, limit };
  }

  async credit(params: {
    userId: string;
    amount: number;
    type: string;
    sourceId: string;
    sourceType?: string;
    expiresAt?: Date;
    postedBy?: string;
    note?: string;
    metadata?: Record<string, any>;
  }) {
    return this.applyTransaction({ ...params, direction: 'credit' as const });
  }

  async debit(params: {
    userId: string;
    amount: number;
    type: string;
    sourceId: string;
    sourceType?: string;
    postedBy?: string;
    note?: string;
    metadata?: Record<string, any>;
  }) {
    return this.applyTransaction({ ...params, direction: 'debit' as const });
  }

  async voidBySource(params: {
    type: string;
    sourceId: string;
    voidedBy?: string;
    note?: string;
  }) {
    const tx: any = await this.walletTransactionModel
      .findOne({ type: params.type, 'metadata.sourceId': params.sourceId })
      .exec();
    if (!tx) {
      throw new BadRequestException({
        message: 'Wallet transaction not found.',
        code: 'wallet_tx_not_found',
      });
    }
    if (tx.status === 'void') return tx.toObject();

    const amount = Number(tx.amount) || 0;
    const delta = tx.direction === 'credit' ? amount : -amount;
    const reverseDelta = -delta;

    if (reverseDelta < 0) {
      const updated = await this.walletBalanceModel.findOneAndUpdate(
        { userId: tx.userId, balance: { $gte: Math.abs(reverseDelta) } },
        { $inc: { balance: reverseDelta }, $set: { updatedAt: new Date() } },
        { new: true },
      );
      if (!updated) {
        throw new BadRequestException({
          message: 'Cannot void transaction due to insufficient wallet balance.',
          code: 'wallet_void_insufficient_balance',
        });
      }
    } else {
      await this.walletBalanceModel.findOneAndUpdate(
        { userId: tx.userId },
        {
          $inc: { balance: reverseDelta },
          $set: { updatedAt: new Date() },
          $setOnInsert: { userId: tx.userId },
        },
        { upsert: true },
      );
    }

    tx.status = 'void';
    tx.note = params.note || tx.note;
    tx.metadata = {
      ...(tx.metadata || {}),
      voidedAt: new Date().toISOString(),
      voidedBy: params.voidedBy,
    };
    await tx.save();
    return tx.toObject();
  }

  private async applyTransaction(params: {
    userId: string;
    amount: number;
    direction: 'credit' | 'debit';
    type: string;
    sourceId: string;
    sourceType?: string;
    expiresAt?: Date;
    postedBy?: string;
    note?: string;
    metadata?: Record<string, any>;
  }) {
    const amount = Math.floor(Number(params.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException({
        message: 'Invalid wallet amount.',
        code: 'wallet_invalid_amount',
      });
    }

    const existing = await this.walletTransactionModel
      .findOne({ type: params.type, 'metadata.sourceId': params.sourceId })
      .lean()
      .exec();
    if (existing) {
      if ((existing as any)?.status === 'void') {
        throw new BadRequestException({
          message:
            'This wallet operation was already processed and voided. Please retry with a new idempotency id.',
          code: 'wallet_tx_void',
        });
      }
      return markWalletTxIdempotent(existing);
    }

    const delta = params.direction === 'credit' ? amount : -amount;
    const sourceType = params.sourceType || params.type;
    const metadata = {
      ...(params.metadata || {}),
      sourceId: params.sourceId,
      sourceRef: (params.metadata as any)?.sourceRef ?? params.sourceId,
      actorId: (params.metadata as any)?.actorId ?? (params.postedBy || params.userId),
      actorRole: (params.metadata as any)?.actorRole ?? (params.postedBy ? 'admin' : 'user'),
      reason: (params.metadata as any)?.reason ?? (params.note || params.type),
    };

    let balanceDoc: any = null;
    if (delta > 0) {
      balanceDoc = await this.walletBalanceModel.findOneAndUpdate(
        { userId: params.userId },
        {
          $inc: { balance: delta },
          $set: { updatedAt: new Date() },
          $setOnInsert: { userId: params.userId },
        },
        { upsert: true, new: true },
      );
    } else {
      balanceDoc = await this.walletBalanceModel.findOneAndUpdate(
        { userId: params.userId, balance: { $gte: amount } },
        { $inc: { balance: delta }, $set: { updatedAt: new Date() } },
        { new: true },
      );
      if (!balanceDoc) {
        throw new BadRequestException({
          message: 'Insufficient wallet balance.',
          code: 'wallet_insufficient_balance',
        });
      }
    }

    try {
      const tx = await this.walletTransactionModel.create({
        userId: params.userId,
        direction: params.direction,
        amount,
        type: params.type,
        status: 'posted',
        sourceType,
        sourceId: params.sourceId,
        balanceAfter: balanceDoc.balance,
        expiresAt: params.expiresAt,
        postedBy: params.postedBy,
        note: params.note,
        metadata,
      });
      return tx.toObject();
    } catch (err: any) {
      // If we raced with an identical transaction, roll back our balance delta and return existing.
      const isDup = err?.code === 11000;
      if (isDup) {
        await this.walletBalanceModel.updateOne(
          { userId: params.userId },
          { $inc: { balance: -delta }, $set: { updatedAt: new Date() } },
        );
        const raced = await this.walletTransactionModel
          .findOne({ type: params.type, 'metadata.sourceId': params.sourceId })
          .lean()
          .exec();
        if (raced) return markWalletTxIdempotent(raced);
      }
      // Roll back on unexpected errors too.
      await this.walletBalanceModel.updateOne(
        { userId: params.userId },
        { $inc: { balance: -delta }, $set: { updatedAt: new Date() } },
      );
      throw err;
    }
  }

  async adminListWallets(options?: {
    page?: number;
    limit?: number;
    search?: string;
    includeEmpty?: boolean;
  }) {
    const limit = Math.max(1, Math.min(100, Number(options?.limit) || 20));
    const page = Math.max(1, Number(options?.page) || 1);
    const skip = (page - 1) * limit;

    const search = options?.search?.trim();
    const includeEmpty = Boolean(options?.includeEmpty);

    // Backward-compatible default: list only existing wallet balance docs.
    if (!includeEmpty) {
      const filter: any = {};
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const users = await this.userModel
          .find({
            roles: { $ne: 'admin' },
            $or: [
              { fullName: { $regex: escaped, $options: 'i' } },
              { email: { $regex: escaped, $options: 'i' } },
              { phone: { $regex: escaped, $options: 'i' } },
              { referralID: { $regex: escaped, $options: 'i' } },
            ],
          })
          .select('_id')
          .limit(500)
          .lean()
          .exec();

        const userIds = users.map((u: any) => u._id);
        filter.userId = { $in: userIds };
      }

      const wallets = await this.walletBalanceModel
        .find(filter)
        .sort({ balance: -1, updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'userId',
          select: 'fullName email phone referralID verification roles gender',
        })
        .lean()
        .exec();

      return { wallets, page, limit };
    }

    // includeEmpty=true: page through users and attach existing balances (if any).
    const userFilter: any = { roles: { $ne: 'admin' } };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFilter.$or = [
        { fullName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { phone: { $regex: escaped, $options: 'i' } },
        { referralID: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [total, users] = await Promise.all([
      this.userModel.countDocuments(userFilter).exec(),
      this.userModel
        .find(userFilter)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .select('fullName email phone referralID verification roles gender')
        .lean()
        .exec(),
    ]);

    const userIds = users.map((u: any) => u?._id).filter(Boolean);
    const balances = userIds.length
      ? await this.walletBalanceModel
          .find({ userId: { $in: userIds } })
          .select('userId balance currency updatedAt')
          .lean()
          .exec()
      : [];
    const balanceByUserId = new Map(balances.map((b: any) => [String(b.userId), b]));

    const wallets = users.map((u: any) => {
      const balanceDoc = balanceByUserId.get(String(u._id));
      if (balanceDoc) {
        return { ...balanceDoc, userId: u };
      }
      return {
        _id: `user:${String(u._id)}`,
        userId: u,
        balance: 0,
        currency: WALLET_CURRENCY,
        updatedAt: undefined,
      };
    });

    const totalPages = Math.ceil(total / limit);
    return { wallets, page, limit, total, totalPages };
  }
}
