import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { Connection, Model, Types } from 'mongoose';
import { BankAccount, Payment } from './interface/payment.interface';
import {
  CreateBankAccountDto,
  CreatePaymentDto,
  GetRefundsQueryDto,
  RejectPaymentDto,
  RejectRefundDto,
  RequestRefundDto,
} from './dto/payment.dto';
import { StorageService } from 'src/storage/storageService';
import { User } from 'src/user/interfaces/user.interface';
import { Flagship } from 'src/flagship/interfaces/flagship.interface';
import { Refund } from './schema/refund.schema';
import { Registration } from 'src/registration/interfaces/registration.interface';
import { MailService } from 'src/mail/mail.service';
import { VerificationStatus } from 'src/constants/verification-status.enum';
import { ensureUserVerifiedForPayment } from './payment-validation';
import { NotificationService } from 'src/notifications/notification.service';
import { computeRefundQuote } from './refund-policy.util';
import { RefundSettlementService } from 'src/refund-settlement/refund-settlement.service';
import { isWalletTxIdempotent, WalletService } from 'src/wallet/wallet.service';
import { resolveSeatBucket, getSeatCounterUpdate } from 'src/flagship/seat-utils';
import { PaymentRejectionReason } from './interface/payment-rejection-reason.interface';
import { RefundRejectionReason } from './interface/refund-rejection-reason.interface';
import { MUSAFIR_DISCOUNT_MAX, calcMusafirDiscount } from 'src/discounts/musafir.constants';

@Injectable()
export class PaymentService {
  constructor(
    @InjectModel('Payment')
    private readonly paymentModel: Model<Payment>,
    @InjectModel('User')
    private readonly user: Model<User>,
    @InjectModel('BankAccount')
    private readonly bankAccountModel: Model<BankAccount>,
    @InjectModel('Flagship')
    private readonly flagshipModel: Model<Flagship>,
    @InjectModel('Registration')
    private readonly registrationModel: Model<Registration>,
    @InjectModel('PaymentRejectionReason')
    private readonly paymentRejectionReasonModel: Model<PaymentRejectionReason>,
    @InjectModel('RefundRejectionReason')
    private readonly refundRejectionReasonModel: Model<RefundRejectionReason>,
    @InjectModel('Refund')
    private readonly refundModel: Model<Refund>,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
    private readonly walletService: WalletService,
    private readonly refundSettlementService: RefundSettlementService,
    @InjectConnection() private readonly connection: Connection,
  ) { }

  private assertUserVerifiedForPayment(user: User): void {
    ensureUserVerifiedForPayment(user);
  }

  private isAdminUser(user?: User): boolean {
    return Array.isArray(user?.roles) && user.roles.includes('admin');
  }

  private encodeCursor(createdAt: Date, id: string): string {
    const payload = `${new Date(createdAt).toISOString()}|${id}`;
    return Buffer.from(payload, 'utf8').toString('base64');
  }

  private decodeCursor(cursor?: string): { createdAt: Date; id: Types.ObjectId } | null {
    if (!cursor) return null;
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const [createdAtRaw, idRaw] = decoded.split('|');
      if (!createdAtRaw || !idRaw || !Types.ObjectId.isValid(idRaw)) return null;
      const createdAt = new Date(createdAtRaw);
      if (Number.isNaN(createdAt.getTime())) return null;
      return { createdAt, id: new Types.ObjectId(idRaw) };
    } catch {
      return null;
    }
  }

  private async resolveScreenshotUrl(value?: string | null): Promise<string | null> {
    if (!value) return null;
    const isUrl = /^https?:\/\//i.test(value);
    if (isUrl) return value;
    try {
      return await this.storageService.getSignedUrl(value);
    } catch {
      return value;
    }
  }

  private async updateUserTripStats(userId: string): Promise<void> {
    const attendedCount = await this.registrationModel.countDocuments({
      userId,
      completedAt: { $exists: true },
    });

    await this.user.findByIdAndUpdate(userId, {
      numberOfFlagshipsAttended: attendedCount,
      discountApplicable: calcMusafirDiscount(attendedCount),
    });
  }

  private parseAmount(value: unknown): number {
    if (value === undefined || value === null) return 0;
    const numeric = value.toString().replace(/[^0-9.-]/g, '');
    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parseCount(value: unknown): number {
    if (value === undefined || value === null) return 0;
    const parsed = Math.floor(Number(value) || 0);
    return Math.max(0, parsed);
  }

  private buildDiscountConfig(raw: any) {
    const enabled = Boolean(raw?.enabled);
    const amountSource = raw?.amount ?? raw?.value ?? raw?.budget;
    const amount = this.parseAmount(amountSource);
    const count = this.parseCount(raw?.count);
    const usedValue = typeof raw?.usedValue === 'number' ? raw.usedValue : 0;
    const usedCount = typeof raw?.usedCount === 'number' ? raw.usedCount : 0;
    const totalValue = Math.max(0, amount * count);
    const remainingValue = Math.max(0, totalValue - usedValue);
    const remainingCount = Math.max(0, count - usedCount);
    return {
      enabled,
      amount,
      count,
      usedValue,
      usedCount,
      totalValue,
      remainingValue,
      remainingCount,
    };
  }

  private async resolveRejectionReason(
    code: string,
    options?: { requireActive?: boolean },
  ) {
    if (!code) return null;
    const query: any = { code };
    if (options?.requireActive) {
      query.active = true;
    }
    const reason = await this.paymentRejectionReasonModel.findOne(query).lean().exec();
    if (options?.requireActive && !reason) {
      throw new BadRequestException('Invalid rejection reason.');
    }
    return reason;
  }

  private async resolveRefundRejectionReason(
    code: string,
    options?: { requireActive?: boolean },
  ) {
    if (!code) return null;
    const query: any = { code };
    if (options?.requireActive) {
      query.active = true;
    }
    const reason = await this.refundRejectionReasonModel.findOne(query).lean().exec();
    if (options?.requireActive && !reason) {
      throw new BadRequestException('Invalid refund rejection reason.');
    }
    return reason;
  }

  private buildRejectionPublicNote(
    reason: any,
    publicNote?: string,
  ): string {
    const trimmed = typeof publicNote === 'string' ? publicNote.trim() : '';
    if (trimmed) return trimmed;
    if (reason?.userMessage) return String(reason.userMessage);
    if (reason?.label) return String(reason.label);
    return 'Your payment was rejected. Please resubmit your payment to confirm your seat.';
  }

  private buildRefundRejectionPublicNote(
    reason: any,
    publicNote?: string,
  ): string {
    const trimmed = typeof publicNote === 'string' ? publicNote.trim() : '';
    if (trimmed) return trimmed;
    if (reason?.userMessage) return String(reason.userMessage);
    if (reason?.label) return String(reason.label);
    return 'Your refund request was rejected.';
  }

  private buildRejectionLabel(reason: any, code?: string): string {
    if (reason?.label) return String(reason.label);
    return code ? `Payment rejected (${code})` : 'Payment rejected';
  }

  private buildRefundRejectionLabel(reason: any, code?: string): string {
    if (reason?.label) return String(reason.label);
    return code ? `Refund rejected (${code})` : 'Refund rejected';
  }

  private async computeGroupLinkStatus(flagshipId: string, groupId: string) {
    const registrations = await this.registrationModel
      .find({
        flagship: flagshipId,
        groupId,
        cancelledAt: { $exists: false },
        refundStatus: { $ne: 'refunded' },
      })
      .select('linkedContacts')
      .lean()
      .exec();

    const groupSize = registrations.length;
    const allLinked = !registrations.some((reg) =>
      (reg as any)?.linkedContacts?.some(
        (contact: any) => contact?.status && contact.status !== 'linked',
      ),
    );

    return { groupSize, allLinked };
  }

  private async buildEligibleDiscounts(registration: any, user: any, flagship: any) {
    const tripType = String(registration?.tripType || '');
    const userGender = registration?.userGender || user?.gender;
    const isVerified = (user as any)?.verification?.status === VerificationStatus.VERIFIED;
    const userId = registration?.userId || registration?.user;

    const soloConfig = this.buildDiscountConfig(flagship?.discounts?.soloFemale);
    const groupConfig = this.buildDiscountConfig(flagship?.discounts?.group);
    const musafirConfig = this.buildDiscountConfig(flagship?.discounts?.musafir);
    const fixedMusafirConfig = {
      ...musafirConfig,
      amount: MUSAFIR_DISCOUNT_MAX,
      totalValue: Math.max(0, MUSAFIR_DISCOUNT_MAX * musafirConfig.count),
      remainingValue: Math.max(
        0,
        MUSAFIR_DISCOUNT_MAX * musafirConfig.count - musafirConfig.usedValue,
      ),
    };

    const completedTrips = userId
      ? await this.registrationModel.countDocuments({
          userId,
          completedAt: { $exists: true },
        })
      : 0;

    const musafirAmount = calcMusafirDiscount(completedTrips);

    let groupStatus = { groupSize: 0, allLinked: false };
    const flagshipId =
      (registration as any)?.flagship?._id
        ? String((registration as any).flagship._id)
        : String(registration?.flagship || registration?.flagshipId || '');
    if (registration?.groupId && flagshipId) {
      groupStatus = await this.computeGroupLinkStatus(
        flagshipId,
        String(registration.groupId),
      );
    }

    const soloEligible =
      soloConfig.enabled &&
      tripType === 'solo' &&
      String(userGender || '').toLowerCase() === 'female';
    const groupEligible =
      groupConfig.enabled &&
      tripType === 'group' &&
      groupStatus.groupSize >= 4 &&
      groupStatus.allLinked;
    const musafirEligible =
      musafirConfig.enabled &&
      isVerified &&
      musafirAmount > 0;

    const soloRemainingOk =
      soloConfig.remainingValue >= soloConfig.amount &&
      soloConfig.remainingCount >= 1;
    const groupRemainingOk =
      groupConfig.remainingValue >= groupConfig.amount &&
      groupConfig.remainingCount >= 1;
    const musafirRemainingOk =
      fixedMusafirConfig.remainingValue >= musafirAmount &&
      fixedMusafirConfig.remainingCount >= 1;

    return {
      soloFemale: {
        eligible: soloEligible && soloRemainingOk,
        amount: soloConfig.amount,
        remainingValue: soloConfig.remainingValue,
        remainingCount: soloConfig.remainingCount,
        totalValue: soloConfig.totalValue,
        count: soloConfig.count,
        reason: !soloConfig.enabled
          ? 'disabled'
          : !soloEligible
            ? 'not_eligible'
            : !soloRemainingOk
              ? 'exhausted'
              : undefined,
      },
      group: {
        eligible: groupEligible && groupRemainingOk,
        amount: groupConfig.amount,
        remainingValue: groupConfig.remainingValue,
        remainingCount: groupConfig.remainingCount,
        totalValue: groupConfig.totalValue,
        count: groupConfig.count,
        groupSize: groupStatus.groupSize,
        allLinked: groupStatus.allLinked,
        reason: !groupConfig.enabled
          ? 'disabled'
          : !groupEligible
            ? 'not_eligible'
            : !groupRemainingOk
              ? 'exhausted'
              : undefined,
      },
      musafir: {
        eligible: musafirEligible && musafirRemainingOk,
        amount: musafirAmount,
        remainingValue: fixedMusafirConfig.remainingValue,
        remainingCount: fixedMusafirConfig.remainingCount,
        totalValue: fixedMusafirConfig.totalValue,
        count: fixedMusafirConfig.count,
        completedTrips,
        reason: !musafirConfig.enabled
          ? 'disabled'
          : !musafirEligible
            ? 'not_eligible'
            : !musafirRemainingOk
              ? 'exhausted'
              : undefined,
      },
    };
  }

  private async tryLockSeat(
    flagshipId: string,
    bucket: 'male' | 'female',
    session?: mongoose.ClientSession,
  ): Promise<boolean> {
    const expr = bucket === 'female'
      ? { $lt: ['$confirmedFemaleCount', '$femaleSeats'] }
      : { $lt: ['$confirmedMaleCount', '$maleSeats'] };
    const update = { $inc: getSeatCounterUpdate(bucket, 'confirmed', 1) };
    const opts: any = { new: true };
    if (session) opts.session = session;
    const updated = await this.flagshipModel.findOneAndUpdate(
      { _id: flagshipId, $expr: expr },
      update,
      opts,
    );
    return Boolean(updated);
  }

  private pickRefundSettlement(settlements?: any[]): any | null {
    if (!Array.isArray(settlements) || settlements.length === 0) return null;
    const score = (settlement: any) => {
      if (settlement?.status === 'posted') return 2;
      if (settlement?.status === 'pending') return 1;
      return 0;
    };
    const timestamp = (settlement: any) => {
      const value = (settlement?.postedAt || settlement?.updatedAt || settlement?.createdAt);
      const date = value ? new Date(value) : null;
      return date?.getTime?.() || 0;
    };
    return settlements
      .slice()
      .sort((a, b) => {
        const scoreDiff = score(b) - score(a);
        if (scoreDiff !== 0) return scoreDiff;
        return timestamp(b) - timestamp(a);
      })[0] || null;
  }

  private async finalizeRegistrationRefund(registration: any, userId?: string) {
    if (!registration?._id) return;
    const seatLocked = Boolean(registration?.seatLocked);
    if (seatLocked) {
      const flagshipId = registration.flagship || registration.flagshipId;
      if (flagshipId) {
        const bucket = resolveSeatBucket(registration.userGender || registration?.user?.gender);
        await this.flagshipModel.findByIdAndUpdate(String(flagshipId), {
          $inc: getSeatCounterUpdate(bucket, 'confirmed', -1),
        });
      }
    }
    await this.releaseDiscountForRegistration(registration);
    await this.registrationModel.findByIdAndUpdate(registration._id, {
      refundStatus: 'refunded',
      amountDue: 0,
      isPaid: false,
      seatLocked: false,
    });
    // Group discounts are handled at payment time; no reallocation needed after refund.
    if (userId) {
      await this.updateUserTripStats(String(userId));
    }
  }

  private async releaseDiscountForRegistration(
    registration: any,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    const discountType = registration?.discountType;
    const discountApplied = Number(registration?.discountApplied || 0);
    if (!discountType || discountApplied <= 0) return;
    const flagshipId = String(registration.flagship || registration.flagshipId || '');
    if (!flagshipId) return;

    await this.flagshipModel.updateOne(
      { _id: flagshipId },
      {
        $inc: {
          [`discounts.${discountType}.usedValue`]: -discountApplied,
          [`discounts.${discountType}.usedCount`]: -1,
        },
      },
      session ? { session } : undefined,
    );

    const price = Number(registration?.price || 0);
    const walletPaid = Number(registration?.walletPaid || 0);
    const currentAmountDue =
      typeof registration?.amountDue === 'number'
        ? registration.amountDue
        : Math.max(0, price - walletPaid - discountApplied);
    const amountDue = Math.max(0, currentAmountDue + discountApplied);
    await this.registrationModel.updateOne(
      { _id: registration._id },
      { $set: { discountApplied: 0, discountType: null, amountDue } },
      session ? { session } : undefined,
    );
  }

  private async ensureRefundSnapshot(refundDoc: any, registration?: any, flagship?: any) {
    if (typeof refundDoc?.refundAmount === 'number') {
      return { refundAmount: refundDoc.refundAmount, updated: false };
    }

    const registrationId = registration?._id;
    if (!registrationId || !flagship?.startDate) {
      return { refundAmount: 0, updated: false };
    }

    const agg = await this.paymentModel
      .aggregate([
        {
          $match: {
            registration: new mongoose.Types.ObjectId(registrationId),
            status: 'approved',
          },
        },
        { $group: { _id: null, amountPaid: { $sum: '$amount' } } },
      ])
      .exec();
    const paidFromPayments = Math.max(0, Math.floor(Number(agg?.[0]?.amountPaid) || 0));
    const walletPaid = typeof registration?.walletPaid === 'number' ? registration.walletPaid : 0;
    const amountPaid = paidFromPayments + Math.max(0, Math.floor(Number(walletPaid) || 0));

    const quote = computeRefundQuote({
      flagshipStartDate: new Date(flagship.startDate),
      submittedAt: refundDoc?.policyAppliedAt || refundDoc?.createdAt || new Date(),
      amountPaid,
    });

    if (quote) {
      refundDoc.amountPaid = quote.amountPaid;
      refundDoc.refundPercent = quote.refundPercent;
      refundDoc.processingFee = quote.processingFee;
      refundDoc.refundAmount = quote.refundAmount;
      refundDoc.tierLabel = quote.tierLabel;
      refundDoc.policyLink = quote.policyLink;
      refundDoc.policyAppliedAt = quote.policyAppliedAt;
      return { refundAmount: quote.refundAmount, updated: true };
    }

    return { refundAmount: 0, updated: false };
  }

  async getBankAccounts(): Promise<BankAccount[]> {
    return this.bankAccountModel.find();
  }

  async getRejectionReasons(): Promise<any[]> {
    return this.paymentRejectionReasonModel
      .find({ active: true })
      .sort({ order: 1, label: 1 })
      .lean()
      .exec();
  }

  async getRefundRejectionReasons(): Promise<any[]> {
    return this.refundRejectionReasonModel
      .find({ active: true })
      .sort({ order: 1, label: 1 })
      .lean()
      .exec();
  }

  async getPaymentHistoryByRegistrationId(
    registrationId: string,
    requester: User,
    options?: { limit?: number; cursor?: string },
  ) {
    if (!registrationId || !Types.ObjectId.isValid(registrationId)) {
      throw new BadRequestException({
        message: 'Registration ID is required.',
        code: 'registration_required',
      });
    }
    if (!requester?._id) {
      throw new ForbiddenException('Authentication required.');
    }

    const isAdmin = this.isAdminUser(requester);
    const registration = await this.registrationModel
      .findById(registrationId)
      .select('userId user amountDue walletPaid refundStatus seatLocked seatLockedAt cancelledAt')
      .lean()
      .exec();
    if (!registration) {
      throw new BadRequestException({
        message: 'Registration not found.',
        code: 'registration_not_found',
      });
    }
    const registrationUserId = registration?.userId || registration?.user;
    if (!isAdmin && registrationUserId && String(registrationUserId) !== String(requester._id)) {
      throw new ForbiddenException('You can only view your own payment history.');
    }

    const limitRaw = Number(options?.limit);
    const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 20));
    const cursor = this.decodeCursor(options?.cursor);

    const paymentMatch: any = { registration: new Types.ObjectId(registrationId) };
    const refundMatch: any = { registration: new Types.ObjectId(registrationId) };
    if (cursor) {
      const cursorFilter = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
      paymentMatch.$or = cursorFilter;
      refundMatch.$or = cursorFilter;
    }

    const payments = await this.paymentModel
      .find(paymentMatch)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const refundsRaw: any[] = await this.refundModel
      .find(refundMatch)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();

    const combined = [
      ...payments.map((payment) => ({
        type: 'payment' as const,
        createdAt: payment.createdAt,
        _id: payment._id,
        doc: payment,
      })),
      ...refundsRaw.map((refund) => ({
        type: 'refund' as const,
        createdAt: refund.createdAt,
        _id: refund._id,
        doc: refund,
      })),
    ].sort((a, b) => {
      const dateDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (dateDiff !== 0) return dateDiff;
      const aId = a._id?.toString?.() || String(a._id);
      const bId = b._id?.toString?.() || String(b._id);
      return bId.localeCompare(aId);
    });

    const pageRecords = combined.slice(0, limit);
    const hasMore = combined.length > limit;
    const lastRecord = pageRecords[pageRecords.length - 1];
    const nextCursor = hasMore && lastRecord
      ? this.encodeCursor(lastRecord.createdAt, String(lastRecord._id))
      : null;

    const pagePayments = pageRecords
      .filter((record) => record.type === 'payment')
      .map((record) => record.doc);
    const pageRefunds = pageRecords
      .filter((record) => record.type === 'refund')
      .map((record) => record.doc);

    const items = await Promise.all(
      pagePayments.map(async (payment: any) => {
        const screenshotUrl = await this.resolveScreenshotUrl(payment?.screenshot);
        const item: any = {
          _id: payment._id,
          createdAt: payment.createdAt,
          amount: payment.amount,
          paymentType: payment.paymentType,
          paymentMethod: payment.paymentMethod,
          status: payment.status,
          screenshotUrl,
          rejectionCode: payment.rejectionCode,
          rejectionLabel: payment.rejectionLabel,
          rejectionPublicNote: payment.rejectionPublicNote,
          remainingDueAtDecision: payment.remainingDueAtDecision,
          reviewedAt: payment.reviewedAt,
          reviewedBy: payment.reviewedBy,
          resubmissionOf: payment.resubmissionOf,
          resubmissionCount: payment.resubmissionCount ?? 0,
        };
        if (isAdmin) {
          item.rejectionInternalNote = payment.rejectionInternalNote;
        }
        if (!isAdmin) {
          delete item.reviewedBy;
        }
        return item;
      }),
    );

    const allRefundIds = await this.refundModel
      .distinct('_id', { registration: new Types.ObjectId(registrationId) })
      .exec();
    const allRefundIdStrings = (allRefundIds || [])
      .map((id) => (id?.toString?.() ? id.toString() : String(id)))
      .filter(Boolean) as string[];
    const settlements = allRefundIdStrings.length
      ? await this.refundSettlementService.findByRefundIds(allRefundIdStrings)
      : [];
    const settlementByRefundId = new Map<string, any[]>();
    settlements.forEach((settlement: any) => {
      const key = settlement?.refundId?.toString?.() || String(settlement?.refundId);
      if (!key) return;
      if (!settlementByRefundId.has(key)) {
        settlementByRefundId.set(key, []);
      }
      settlementByRefundId.get(key)?.push(settlement);
    });

    const refunds = pageRefunds.map((refund) => {
      const refundId = refund?._id?.toString?.() || String(refund?._id);
      const settlement = this.pickRefundSettlement(settlementByRefundId.get(refundId));
      const item: any = {
        _id: refund._id,
        createdAt: refund.createdAt,
        updatedAt: refund.updatedAt,
        status: refund.status,
        amountPaid: refund.amountPaid,
        refundAmount: refund.refundAmount,
        refundPercent: refund.refundPercent,
        processingFee: refund.processingFee,
        tierLabel: refund.tierLabel,
        policyLink: refund.policyLink,
        rejectionCode: refund.rejectionCode,
        rejectionLabel: refund.rejectionLabel,
        rejectionPublicNote: refund.rejectionPublicNote,
        settlement: settlement
          ? {
            status: settlement.status,
            method: settlement.method,
            postedAt: settlement.postedAt || null,
          }
          : null,
      };
      if (isAdmin) {
        item.rejectionInternalNote = refund.rejectionInternalNote;
      }
      return item;
    });

    const summaryAgg = await this.paymentModel
      .aggregate([
        { $match: { registration: new Types.ObjectId(registrationId) } },
        {
          $facet: {
            counts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            totals: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  maxResubmissionCount: { $max: '$resubmissionCount' },
                  approvedAmount: {
                    $sum: {
                      $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0],
                    },
                  },
                },
              },
            ],
          },
        },
      ])
      .exec();

    const counts = summaryAgg?.[0]?.counts || [];
    const totals = summaryAgg?.[0]?.totals?.[0] || {
      total: 0,
      maxResubmissionCount: 0,
      approvedAmount: 0,
    };
    const countByStatus: Record<string, number> = counts.reduce((acc: any, entry: any) => {
      acc[entry._id] = entry.count;
      return acc;
    }, {});
    const latestPayment = await this.paymentModel
      .findOne({ registration: new Types.ObjectId(registrationId) })
      .sort({ createdAt: -1, _id: -1 })
      .select('status _id')
      .lean()
      .exec();

    const timeline: any[] = [];
    items.forEach((item: any) => {
      timeline.push({
        event: 'submitted',
        at: item.createdAt,
        paymentId: item._id,
        status: 'pendingApproval',
        label: 'Payment submitted',
      });
      if (item.status === 'pendingApproval') {
        timeline.push({
          event: 'pending',
          at: item.createdAt,
          paymentId: item._id,
          status: item.status,
          label: 'Pending approval',
        });
      } else if (item.status === 'approved') {
        timeline.push({
          event: 'approved',
          at: item.reviewedAt || item.createdAt,
          paymentId: item._id,
          status: item.status,
          label: 'Payment approved',
        });
      } else if (item.status === 'rejected') {
        timeline.push({
          event: 'rejected',
          at: item.reviewedAt || item.createdAt,
          paymentId: item._id,
          status: item.status,
          label: 'Payment rejected',
          note: item.rejectionPublicNote,
        });
      }
    });

    pageRefunds.forEach((refund: any) => {
      const refundId = refund?._id?.toString?.() || String(refund?._id);
      const settlement = this.pickRefundSettlement(settlementByRefundId.get(refundId));
      timeline.push({
        event: 'refund_requested',
        at: refund.createdAt,
        refundId: refund._id,
        status: refund.status,
        label: 'Refund requested',
      });
      if (refund.status === 'cleared') {
        timeline.push({
          event: 'refund_approved',
          at: refund.updatedAt || refund.createdAt,
          refundId: refund._id,
          status: refund.status,
          label: 'Refund approved',
        });
      } else if (refund.status === 'rejected') {
        timeline.push({
          event: 'refund_rejected',
          at: refund.updatedAt || refund.createdAt,
          refundId: refund._id,
          status: refund.status,
          label: 'Refund rejected',
          note: refund.rejectionPublicNote,
        });
      }
      if (settlement?.status === 'posted') {
        const label =
          settlement?.method === 'bank_refund' ? 'Refund processed' : 'Refund credited';
        timeline.push({
          event: 'refund_credited',
          at: settlement.postedAt || settlement.updatedAt || refund.updatedAt || refund.createdAt,
          refundId: refund._id,
          status: 'refunded',
          label,
        });
      }
    });

    if (registration?.seatLockedAt) {
      timeline.push({
        event: 'seat_locked',
        at: registration.seatLockedAt,
        label: 'Seat locked',
      });
    }
    if (registration?.cancelledAt) {
      timeline.push({
        event: 'seat_cancelled',
        at: registration.cancelledAt,
        label: 'Seat cancelled',
      });
    }

    timeline.sort((a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const paidFromPayments = Math.max(0, Math.floor(Number(totals.approvedAmount) || 0));
    const walletPaid =
      typeof (registration as any)?.walletPaid === 'number'
        ? (registration as any).walletPaid
        : 0;
    const totalPaid = paidFromPayments + Math.max(0, Math.floor(Number(walletPaid) || 0));
    const totalRefunded = allRefundIdStrings.reduce((sum, refundId) => {
      const settlement = this.pickRefundSettlement(settlementByRefundId.get(refundId));
      if (settlement?.status === 'posted') {
        return sum + Math.max(0, Math.floor(Number(settlement.amount) || 0));
      }
      return sum;
    }, 0);
    const remainingDue =
      typeof (registration as any)?.amountDue === 'number'
        ? Math.max(0, Math.floor(Number((registration as any).amountDue) || 0))
        : null;

    return {
      items,
      refunds,
      summary: {
        total: totals.total || 0,
        pendingCount: countByStatus.pendingApproval || 0,
        approvedCount: countByStatus.approved || 0,
        rejectedCount: countByStatus.rejected || 0,
        lastStatus: latestPayment?.status || null,
        hasPending: (countByStatus.pendingApproval || 0) > 0,
        resubmissionCount: totals.maxResubmissionCount || 0,
        lastPaymentId: latestPayment?._id || null,
        totalPaid,
        totalRefunded,
        remainingDue,
        refundStatus: (registration as any)?.refundStatus || 'none',
      },
      timeline,
      nextCursor,
    };
  }

  private getRefundSettlementCollectionName(): string {
    try {
      const conn = (this.refundModel as any)?.db;
      const settlementModel = conn?.model?.('RefundSettlement');
      const name = settlementModel?.collection?.name;
      if (typeof name === 'string' && name.trim()) return name;
    } catch {
      // ignore
    }
    // Mongoose default pluralization for model 'RefundSettlement'
    return 'refundsettlements';
  }

  async getRefunds(query?: GetRefundsQueryDto): Promise<any> {
    const group = query?.group || 'all';
    const pageRaw = Number((query as any)?.page);
    const limitRaw = Number((query as any)?.limit);
    const shouldPaginate =
      (Number.isFinite(pageRaw) && pageRaw > 0) ||
      (Number.isFinite(limitRaw) && limitRaw > 0);
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1);
    const skip = (page - 1) * limit;

    const flagshipIdRaw = query?.flagshipId;
    let registrationIds: Types.ObjectId[] | null = null;
    if (flagshipIdRaw) {
      if (!Types.ObjectId.isValid(flagshipIdRaw)) {
        throw new BadRequestException('Invalid flagship id.');
      }
      const distinctIds = await this.registrationModel.distinct('_id', {
        flagship: new Types.ObjectId(flagshipIdRaw),
      }) as (Types.ObjectId | string)[];
      registrationIds = distinctIds
        .map((id) => {
          try {
            return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
          } catch {
            return null;
          }
        })
        .filter((id): id is Types.ObjectId => id !== null);
      if (registrationIds.length === 0) {
        return shouldPaginate
          ? { refunds: [], page, limit, total: 0, totalPages: 0 }
          : [];
      }
    }

    const attachSettlement = async (refunds: any[]) => {
      const refundIds = refunds
        .map((r) => r?._id?.toString?.() || String(r?._id))
        .filter(Boolean) as string[];
      const settlements = await this.refundSettlementService.findByRefundIds(refundIds);
      const settlementByRefundId = new Map<string, any[]>();
      settlements.forEach((settlement: any) => {
        const key = settlement?.refundId?.toString?.() || String(settlement?.refundId);
        if (!key) return;
        if (!settlementByRefundId.has(key)) {
          settlementByRefundId.set(key, []);
        }
        settlementByRefundId.get(key)?.push(settlement);
      });
      return refunds.map((r) => ({
        ...r,
        settlement: this.pickRefundSettlement(settlementByRefundId.get(String(r._id))) || null,
      })) as any[];
    };

    if (!shouldPaginate) {
      const filter: any = {};
      if (group === 'pending') filter.status = 'pending';
      if (group === 'rejected') filter.status = 'rejected';
      if (group === 'approved_not_credited' || group === 'credited') filter.status = 'cleared';
      if (registrationIds) filter.registration = { $in: registrationIds };

      const refunds: any[] = await this.refundModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .populate({
          path: 'registration',
          populate: [{ path: 'user' }, { path: 'flagship' }, { path: 'paymentId' }],
        })
        .lean()
        .exec();

      const withSettlement = await attachSettlement(refunds);

      if (group === 'approved_not_credited') {
        return withSettlement.filter(
          (r: any) => r?.status === 'cleared' && r?.settlement?.status !== 'posted',
        );
      }
      if (group === 'credited') {
        return withSettlement.filter(
          (r: any) => r?.status === 'cleared' && r?.settlement?.status === 'posted',
        );
      }
      return withSettlement;
    }

    const populateRegistration = {
      path: 'registration',
      populate: [{ path: 'user' }, { path: 'flagship' }, { path: 'paymentId' }],
    };

    // For credited and approved_not_credited, filter with settlements at the DB layer
    // to keep pagination accurate and efficient.
    if (group === 'credited' || group === 'approved_not_credited') {
      const settlementCollection = this.getRefundSettlementCollectionName();
      const settlementMatch =
        group === 'credited'
          ? { 'settlement.status': 'posted' }
          : { $or: [{ 'settlement.status': { $ne: 'posted' } }, { settlement: null }] };

      const agg = await (this.refundModel as any)
        .aggregate([
          { $match: { status: 'cleared' } },
          ...(registrationIds ? [{ $match: { registration: { $in: registrationIds } } }] : []),
          {
            $lookup: {
              from: settlementCollection,
              localField: '_id',
              foreignField: 'refundId',
              as: 'settlement',
            },
          },
          { $unwind: { path: '$settlement', preserveNullAndEmptyArrays: true } },
          { $match: settlementMatch },
          { $sort: { createdAt: -1, _id: -1 } },
          { $project: { _id: 1 } },
          {
            $facet: {
              results: [{ $skip: skip }, { $limit: limit }],
              totalCount: [{ $count: 'count' }],
            },
          },
        ])
        .exec();

      const ids = (agg?.[0]?.results || []).map((r: any) => r?._id).filter(Boolean);
      const total = Number(agg?.[0]?.totalCount?.[0]?.count || 0);
      const totalPages = Math.ceil(total / limit);

      if (ids.length === 0) {
        return { refunds: [], page, limit, total, totalPages };
      }

      const refunds: any[] = await this.refundModel
        .find({ _id: { $in: ids } })
        .populate(populateRegistration)
        .lean()
        .exec();

      const refundById = new Map(refunds.map((r) => [String(r._id), r]));
      const ordered = ids.map((id: any) => refundById.get(String(id))).filter(Boolean);
      const withSettlement = await attachSettlement(ordered);

      return { refunds: withSettlement, page, limit, total, totalPages };
    }

    const filter: any = {};
    if (group === 'pending') filter.status = 'pending';
    if (group === 'rejected') filter.status = 'rejected';
    // group === 'all' => no filter
    if (registrationIds) filter.registration = { $in: registrationIds };

    const [total, refunds] = await Promise.all([
      this.refundModel.countDocuments(filter).exec(),
      this.refundModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate(populateRegistration)
        .lean()
        .exec(),
    ]);
    const totalPages = Math.ceil(total / limit);
    const withSettlement = await attachSettlement(refunds as any[]);

    return { refunds: withSettlement, page, limit, total, totalPages };
  }

  async getPayment(id: string): Promise<Payment> {
    const payment = await this.paymentModel
      .findById(id)
      .populate({
        path: 'registration',
        populate: [{ path: 'user' }, { path: 'flagship' }],
      })
      .populate('bankAccount')
      .exec();

    if (payment && payment.screenshot) {
      const isUrl = /^https?:\/\//i.test(payment.screenshot);
      if (!isUrl) {
        const screenshotUrl = await this.storageService.getSignedUrl(
          payment.screenshot,
        );
        payment.screenshot = screenshotUrl;
      }
    }

    return payment;
  }

  async findPaymentsByUser(
    userId: string,
    options?: { limit?: number; cursor?: string },
  ) {
    const limit =
      options?.limit && Number(options.limit) > 0
        ? Math.min(100, Number(options.limit))
        : 20;
    const registrationIds = await this.registrationModel
      .distinct('_id', {
        $or: [{ user: new Types.ObjectId(userId) }, { userId: new Types.ObjectId(userId) }],
      })
      .exec();
    if (!registrationIds || registrationIds.length === 0) {
      return { payments: [], nextCursor: null };
    }

    const match: any = {
      registration: { $in: registrationIds },
    };

    if (options?.cursor) {
      match._id = { $lt: options.cursor };
    }

    const payments = await this.paymentModel
      .find(match)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate({
        path: 'registration',
        populate: {
          path: 'flagship',
          model: 'Flagship',
          select: 'tripName slug',
        },
      })
      .lean()
      .exec();

    const hasMore = payments.length > limit;
    if (hasMore) payments.pop();
    const nextCursor = hasMore
      ? payments[payments.length - 1]._id?.toString?.() ?? null
      : null;

    return {
      payments,
      nextCursor,
    };
  }

  async createBankAccount(
    createBankAccountDto: CreateBankAccountDto,
  ): Promise<BankAccount> {
    const bankAccount = new this.bankAccountModel(createBankAccountDto);
    return bankAccount.save();
  }

  async requestRefund(requestRefundDto: RequestRefundDto, requester: User): Promise<Refund> {
    if (!requester?._id) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'refund_auth_required',
      });
    }

    const registration = await this.registrationModel
      .findById(requestRefundDto.registration)
      .exec();
    if (!registration) {
      throw new BadRequestException({
        message: 'Registration not found.',
        code: 'refund_registration_not_found',
      });
    }

    const registrationId = (registration as any)._id;
    const registrationUserId = (registration as any).userId || (registration as any).user;
    if (!registrationUserId || String(registrationUserId) !== String(requester._id)) {
      throw new ForbiddenException('You can only request a refund for your own registration.');
    }

    // Split flow: seat cancellation (confirmed) then refund request.
    // For backward compatibility, we still allow confirmed seats here,
    // but we don't mutate the registration status until all eligibility checks pass.
    const currentStatus = String((registration as any)?.status || '');
    const refundStatus = String((registration as any)?.refundStatus || 'none');
    if (currentStatus !== 'confirmed') {
      throw new BadRequestException({
        message: 'Only confirmed registrations can request a refund.',
        code: 'refund_requires_confirmation',
      });
    }
    if (!registration.cancelledAt) {
      throw new BadRequestException({
        message: 'Please cancel your seat first before requesting a refund.',
        code: 'refund_requires_cancellation',
      });
    }
    if (['processing', 'pending', 'refunded'].includes(refundStatus)) {
      throw new BadRequestException({
        message: 'A refund request already exists for this registration.',
        code: 'refund_already_requested',
      });
    }

    // Compute amountPaid = sum(approved payments) + walletPaid (if any).
    const agg = await this.paymentModel
      .aggregate([
        {
          $match: {
            registration: new mongoose.Types.ObjectId(registrationId),
            status: 'approved',
          },
        },
        { $group: { _id: null, amountPaid: { $sum: '$amount' } } },
      ])
      .exec();
    const paidFromPayments = Math.max(0, Math.floor(Number(agg?.[0]?.amountPaid) || 0));
    const walletPaid =
      typeof (registration as any)?.walletPaid === 'number'
        ? (registration as any).walletPaid
        : 0;
    const amountPaid = paidFromPayments + Math.max(0, Math.floor(Number(walletPaid) || 0));

    if (amountPaid <= 0) {
      throw new BadRequestException({
        message: 'Refunds can only be requested after your payment is approved.',
        code: 'refund_payment_not_approved',
      });
    }

    const flagshipId = (registration as any).flagship || (registration as any).flagshipId;
    const flagship: any = await this.flagshipModel
      .findById(flagshipId)
      .select('startDate tripName')
      .lean()
      .exec();
    if (!flagship?.startDate) {
      throw new BadRequestException({
        message: 'Flagship not found for registration.',
        code: 'refund_flagship_not_found',
      });
    }

    const quote = computeRefundQuote({
      flagshipStartDate: new Date(flagship.startDate),
      submittedAt: new Date(),
      amountPaid,
    });

    const existing = await this.refundModel.exists({
      registration: registrationId,
      status: { $in: ['pending', 'cleared'] },
    });
    if (existing) {
      throw new BadRequestException({
        message: 'A refund request already exists for this registration.',
        code: 'refund_already_requested',
      });
    }

    const lastRejected: any = await this.refundModel
      .findOne({
        registration: registrationId,
        status: 'rejected',
      })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();

    if (lastRejected?.updatedAt) {
      const lastRejectedAt = new Date(lastRejected.updatedAt);
      const retryAt = new Date(lastRejectedAt.getTime() + 24 * 60 * 60 * 1000);
      if (Date.now() < retryAt.getTime()) {
        throw new BadRequestException({
          message: 'Refund request was recently rejected. Please wait 24 hours before reapplying.',
          code: 'refund_cooldown',
          retryAt: retryAt.toISOString(),
        });
      }
    }

    const previousRegistration: any = await this.registrationModel.findOneAndUpdate(
      {
        _id: registrationId,
        userId: registrationUserId,
        status: 'confirmed',
      },
      { $set: { refundStatus: 'processing' } },
      { new: false },
    );
    if (!previousRegistration) {
      throw new BadRequestException({
        message: 'Refund could not be requested. Please retry.',
        code: 'refund_state_changed',
      });
    }

    const previousStatus = String(previousRegistration?.refundStatus || 'none');
    let savedRefund: Refund;
    try {
      const refund = new this.refundModel({
        ...requestRefundDto,
        amountPaid: quote.amountPaid,
        refundPercent: quote.refundPercent,
        processingFee: quote.processingFee,
        refundAmount: quote.refundAmount,
        tierLabel: quote.tierLabel,
        policyLink: quote.policyLink,
        policyAppliedAt: quote.policyAppliedAt,
      });
      savedRefund = await refund.save();
    } catch (error) {
      try {
        await this.registrationModel.findOneAndUpdate(
          {
            _id: registrationId,
            userId: registrationUserId,
            refundStatus: 'processing',
          },
          { $set: { refundStatus: previousStatus } },
        );
      } catch (rollbackError) {
        console.log('Failed to rollback registration status after refund save failure:', rollbackError);
      }
      throw error;
    }

    // Notify requester about the quoted refund amount + policy link.
    try {
      const registrationIdString =
        (registration as any)._id?.toString?.() || requestRefundDto.registration;
      const refundUrl =
        process.env.FRONTEND_URL && registrationIdString
          ? `${process.env.FRONTEND_URL}/musafir/refund/${registrationIdString}`
          : undefined;

      await this.notificationService.createForUser(String(requester._id), {
        title: 'Refund request received',
        message: `Estimated refund: Rs.${quote.refundAmount.toLocaleString()} (includes PKR ${quote.processingFee}).`,
        type: 'refund',
        link: registrationIdString ? `/musafir/refund/${registrationIdString}` : '/passport',
        metadata: {
          refundId: savedRefund._id?.toString(),
          registrationId: registrationIdString,
          refundAmount: quote.refundAmount,
          amountPaid: quote.amountPaid,
          refundPercent: quote.refundPercent,
          policyLink: quote.policyLink,
        },
      });

      if ((requester as any)?.email) {
        await this.mailService.sendMail(
          (requester as any).email,
          'Your 3Musafir refund request has been received',
          './refund-requested',
          {
            fullName: (requester as any).fullName || 'Musafir',
            tripName: flagship?.tripName || 'your trip',
            refundAmount: quote.refundAmount,
            amountPaid: quote.amountPaid,
            refundPercent: quote.refundPercent,
            processingFee: quote.processingFee,
            refundPolicyLink: quote.policyLink,
            refundUrl,
          },
        );
      }
    } catch (e) {
      console.log('Failed to send refund requested comms:', e);
    }

    return savedRefund;
  }

  async getRefundQuote(registrationId: string, requester: User) {
    if (!requester?._id) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'refund_auth_required',
      });
    }

    const registration: any = await this.registrationModel
      .findById(registrationId)
      .lean()
      .exec();
    if (!registration) {
      throw new BadRequestException({
        message: 'Registration not found.',
        code: 'refund_registration_not_found',
      });
    }

    const registrationUserId = registration.userId || registration.user;
    if (!registrationUserId || String(registrationUserId) !== String(requester._id)) {
      throw new ForbiddenException('You can only view a refund quote for your own registration.');
    }

    const flagshipId = registration.flagship || registration.flagshipId;
    const flagship: any = await this.flagshipModel
      .findById(flagshipId)
      .select('startDate')
      .lean()
      .exec();
    if (!flagship?.startDate) {
      throw new BadRequestException({
        message: 'Flagship not found for registration.',
        code: 'refund_flagship_not_found',
      });
    }

    const agg = await this.paymentModel
      .aggregate([
        {
          $match: {
            registration: new mongoose.Types.ObjectId(registration._id),
            status: 'approved',
          },
        },
        { $group: { _id: null, amountPaid: { $sum: '$amount' } } },
      ])
      .exec();
    const paidFromPayments = Math.max(0, Math.floor(Number(agg?.[0]?.amountPaid) || 0));
    const walletPaid = typeof registration.walletPaid === 'number' ? registration.walletPaid : 0;
    const amountPaid = paidFromPayments + Math.max(0, Math.floor(Number(walletPaid) || 0));

    return computeRefundQuote({
      flagshipStartDate: new Date(flagship.startDate),
      submittedAt: new Date(),
      amountPaid,
    });
  }

  async getRefundStatusForRegistration(registrationId: string, requester: User) {
    if (!requester?._id) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'refund_auth_required',
      });
    }

    const registration: any = await this.registrationModel
      .findById(registrationId)
      .lean()
      .exec();
    if (!registration) {
      throw new BadRequestException({
        message: 'Registration not found.',
        code: 'refund_registration_not_found',
      });
    }

    const registrationUserId = registration.userId || registration.user;
    if (!registrationUserId || String(registrationUserId) !== String(requester._id)) {
      throw new ForbiddenException(
        'You can only view refund status for your own registration.',
      );
    }

    const refund: any = await this.refundModel
      .findOne({ registration: registration._id })
      .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
      .lean()
      .exec();

    const refundId =
      refund?._id?.toString?.() || (refund?._id ? String(refund._id) : null);
    const settlements = refundId
      ? await this.refundSettlementService.findByRefundIds([refundId])
      : [];
    const settlement = this.pickRefundSettlement(settlements);

    let retryAt: string | undefined;
    if (refund?.status === 'rejected' && refund?.updatedAt) {
      const updatedAt = new Date(refund.updatedAt);
      const retryAtDate = new Date(updatedAt.getTime() + 24 * 60 * 60 * 1000);
      retryAt = retryAtDate.toISOString();
    }

    const refundSafe = refund ? { ...refund } : null;
    if (refundSafe) {
      delete (refundSafe as any).rejectionInternalNote;
    }

    return {
      registration: {
        _id: registration._id?.toString?.() || String(registration._id),
        status: registration.status,
        refundStatus: (registration as any)?.refundStatus || 'none',
      },
      refund: refundSafe,
      settlement,
      retryAt,
    };
  }

  async calculateUserDiscount(userId: string): Promise<number> {
    try {
      // Get all completed registrations for the user
      const completedRegistrations = await this.registrationModel.find({
        userId: userId,
        completedAt: { $exists: true },
      }).exec();

      // Calculate discount: 500 per completed trip, capped
      const calculatedDiscount = calcMusafirDiscount(completedRegistrations.length);

      // Persist onto the user document as well
      await this.user.findByIdAndUpdate(userId, {
        numberOfFlagshipsAttended: completedRegistrations.length,
        discountApplicable: calculatedDiscount,
      });

      return calculatedDiscount;
    } catch (error) {
      console.error('Error calculating user discount:', error);
      return 0;
    }
  }

  async getUserDiscountByRegistrationId(registrationId: string): Promise<number> {
    try {
      // Get the registration to find the user ID
      const registration = await this.registrationModel.findById(registrationId)
        .populate('user')
        .exec();

      if (!registration) {
        throw new Error('Registration not found');
      }

      // Calculate discount for the user
      const userId = (registration.user as any)._id || registration.userId;
      return await this.calculateUserDiscount(userId);
    } catch (error) {
      console.error('Error getting user discount by registration ID:', error);
      return 0;
    }
  }

  async getEligibleDiscountsByRegistrationId(registrationId: string) {
    if (!registrationId) {
      throw new BadRequestException({
        message: 'Registration ID is required.',
        code: 'registration_required',
      });
    }
    const registration = await this.registrationModel
      .findById(registrationId)
      .populate('flagship')
      .populate('user')
      .lean()
      .exec();
    if (!registration) {
      throw new BadRequestException({
        message: 'Registration not found.',
        code: 'registration_not_found',
      });
    }

    const user = (registration as any)?.user || null;
    const flagship = (registration as any)?.flagship || null;
    return this.buildEligibleDiscounts(registration, user, flagship);
  }

  async createPayment(
    createPaymentDto: CreatePaymentDto,
    screenshot: Express.Multer.File | undefined,
    requester?: User,
  ): Promise<any> {
    // Get registration to find user ID
    const registration = await this.registrationModel.findById(createPaymentDto.registration);
    if (!registration) {
      throw new Error('Registration not found');
    }
    const flagshipId = (registration as any).flagship || (registration as any).flagshipId;
    let flagshipName: string | null = null;
    let flagshipDoc: any = null;
    if (flagshipId) {
      flagshipDoc = await this.flagshipModel
        .findById(flagshipId)
        .select('tripName discounts')
        .lean()
        .exec();
      flagshipName = flagshipDoc?.tripName || null;
    }

    const lastPayment = await this.paymentModel
      .findOne({ registration: createPaymentDto.registration })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const isReupload = lastPayment?.status === 'rejected';
    const resubmissionOf = isReupload ? lastPayment?._id : undefined;
    const resubmissionRoot = isReupload
      ? (lastPayment as any)?.resubmissionRoot || lastPayment?._id
      : undefined;
    const resubmissionCount = isReupload
      ? Math.max(0, Number((lastPayment as any)?.resubmissionCount || 0) + 1)
      : 0;

    const registrationStatus = String((registration as any)?.status || '');
    if (!['payment', 'confirmed'].includes(registrationStatus)) {
      throw new BadRequestException({
        message: registrationStatus === 'waitlisted'
          ? 'You are currently waitlisted. You will be notified when a seat opens.'
          : 'Registration is not eligible for payment yet.',
        code: 'registration_not_payable',
      });
    }
    if ((registration as any)?.cancelledAt) {
      throw new BadRequestException({
        message: 'Cancelled registrations cannot accept payments.',
        code: 'registration_cancelled',
      });
    }
    const refundStatus = String((registration as any)?.refundStatus || 'none');
    if (['pending', 'processing', 'refunded'].includes(refundStatus)) {
      throw new BadRequestException({
        message: 'Refunded or refunding registrations cannot accept payments.',
        code: 'registration_refund_locked',
      });
    }

    const registrationUserId = (registration as any).userId || (registration as any).user;

    const pendingPayment = await this.paymentModel
      .findOne({ registration: createPaymentDto.registration, status: 'pendingApproval' })
      .select('_id')
      .lean()
      .exec();

    const now = new Date();
    const waitlistOfferStatus = String((registration as any)?.waitlistOfferStatus || 'none');
    const waitlistOfferExpiresAt = (registration as any)?.waitlistOfferExpiresAt;
    if (
      waitlistOfferStatus === 'accepted' &&
      waitlistOfferExpiresAt &&
      new Date(waitlistOfferExpiresAt) <= now
    ) {
      const flagshipId = (registration as any).flagship || (registration as any).flagshipId;
      if (pendingPayment?._id) {
        await this.rejectPaymentSystem(String(pendingPayment._id), 'waitlist_offer_expired');
      }
      await this.registrationModel.findByIdAndUpdate(createPaymentDto.registration, {
        status: 'waitlisted',
        waitlistAt: now,
        waitlistOfferStatus: 'expired',
        waitlistOfferResponse: 'declined',
        waitlistOfferSentAt: null,
        waitlistOfferAcceptedAt: null,
        waitlistOfferExpiresAt: null,
      });
      if (flagshipId) {
        const bucket = resolveSeatBucket((registration as any)?.userGender);
        await this.flagshipModel.findByIdAndUpdate(String(flagshipId), {
          $inc: getSeatCounterUpdate(bucket, 'waitlisted', 1),
        });
      }
      throw new BadRequestException({
        message: 'Your waitlist offer has expired. You have been moved back to the waitlist.',
        code: 'waitlist_offer_expired',
      });
    }

    if (pendingPayment?._id) {
      throw new BadRequestException({
        message: 'A payment for this registration is already pending approval.',
        code: 'payment_pending_approval',
      });
    }

    if (requester && registrationUserId && registrationUserId.toString() !== requester._id?.toString()) {
      throw new ForbiddenException('You can only pay for your own registration.');
    }

    let registrationUser: any = null;
    if (registrationUserId) {
      registrationUser = await this.user.findById(registrationUserId);
      if (!registrationUser) {
        throw new BadRequestException('User for registration not found.');
      }
      this.assertUserVerifiedForPayment(registrationUser);
    }

    const notifyUserPaymentSubmitted = async (paymentDoc: any) => {
      const userId =
        registrationUser?._id?.toString?.() ||
        registrationUserId?.toString?.();
      if (!userId) {
        return;
      }
      const registrationIdString =
        (registration as any)?._id?.toString?.() || createPaymentDto.registration;
      const link = registrationIdString
        ? `/musafir/payment/${registrationIdString}`
        : '/passport';
      const frontendBase = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
      const absoluteLink =
        registrationIdString && frontendBase
          ? `${frontendBase}/musafir/payment/${registrationIdString}`
          : link;
      const walletAmount = Number(paymentDoc.walletRequested) || 0;
      const totalPaid =
        Math.max(0, Number(paymentDoc.amount) || 0) + walletAmount;
      const remainingDue =
        typeof currentAmountDue === 'number' ? Math.max(0, currentAmountDue) : null;
      const remainingSuffix =
        typeof remainingDue === 'number'
          ? ` Remaining due: Rs.${remainingDue.toLocaleString()}.`
          : '';
      try {
        await this.notificationService.createForUser(userId, {
          title: 'Payment submitted',
          message: `We received Rs.${totalPaid.toLocaleString()} for ${flagshipName || 'your trip'}.${remainingSuffix}`,
          type: 'payment',
          link,
          metadata: {
            paymentId: paymentDoc._id?.toString?.(),
            registrationId: registrationIdString,
            amount: totalPaid,
            paymentMethod: paymentDoc.paymentMethod,
            paymentType: paymentDoc.paymentType,
            remainingDue,
          },
        });
      } catch (error) {
        console.log('Failed to send payment submitted notification:', error);
      }
      if (registrationUser?.email) {
        try {
          await this.mailService.sendPaymentSubmissionEmail(
            registrationUser.email,
            registrationUser.fullName || 'Musafir',
            flagshipName || 'your trip',
            totalPaid,
            paymentDoc.paymentType || 'payment',
            absoluteLink,
            typeof remainingDue === 'number' ? remainingDue : undefined,
          );
        } catch (error) {
          console.log('Failed to send payment submission email:', error);
        }
      }
    };

    const notifyAdminOnReupload = async (paymentDoc: any) => {
      if (!isReupload || !paymentDoc?._id) return;
      try {
        const adminUrl =
          process.env.FRONTEND_URL && paymentDoc?._id
            ? `${process.env.FRONTEND_URL}/admin/payment/${paymentDoc._id.toString()}`
            : undefined;

        await this.mailService.sendAdminPaymentReuploadNotification({
          paymentId: paymentDoc._id.toString(),
          registrationId: createPaymentDto.registration,
          flagshipId: flagshipId?.toString?.(),
          flagshipName,
          userId: registrationUser?._id?.toString?.() || registrationUserId?.toString?.(),
          userName: registrationUser?.fullName,
          userEmail: registrationUser?.email,
          amount: paymentDoc.amount,
          submittedAt: paymentDoc.createdAt,
          adminUrl,
          resubmissionCount: paymentDoc.resubmissionCount,
        });
      } catch (error) {
        console.log('Failed to send admin payment reupload email:', error);
      }
    };

    const registrationPrice =
      typeof (registration as any)?.price === 'number'
        ? (registration as any).price
        : 0;
    const currentWalletPaid =
      typeof (registration as any)?.walletPaid === 'number'
        ? (registration as any).walletPaid
        : 0;
    let currentDiscountApplied =
      typeof (registration as any)?.discountApplied === 'number'
        ? (registration as any).discountApplied
        : 0;
    const existingDiscountType = (registration as any)?.discountType;
    const requestedDiscountType = (createPaymentDto as any)?.discountType as
      | 'soloFemale'
      | 'group'
      | 'musafir'
      | undefined;

    if (requestedDiscountType && existingDiscountType && existingDiscountType !== requestedDiscountType) {
      throw new BadRequestException({
        message: 'A discount has already been selected for this registration.',
        code: 'discount_already_selected',
      });
    }

    const baseAmountDue =
      typeof (registration as any)?.amountDue === 'number'
        ? (registration as any).amountDue
        : Math.max(0, registrationPrice - currentDiscountApplied - currentWalletPaid);

    let currentAmountDue = baseAmountDue;

    if (requestedDiscountType && (!existingDiscountType || currentDiscountApplied <= 0)) {
      const eligible = await this.buildEligibleDiscounts(registration, registrationUser, flagshipDoc);
      const selected = (eligible as any)?.[requestedDiscountType];
      const discountAmount = Math.max(0, Math.floor(Number(selected?.amount) || 0));
      if (!selected?.eligible || discountAmount <= 0) {
        throw new BadRequestException({
          message: 'Selected discount is not available.',
          code: 'discount_not_eligible',
        });
      }

      const totalValue = Math.max(0, Number(selected?.totalValue || 0));
      const totalCount = Math.max(0, Number(selected?.count || 0));
      const updateResult = await this.flagshipModel.updateOne(
        {
          _id: flagshipId,
          [`discounts.${requestedDiscountType}.usedValue`]: { $lte: totalValue - discountAmount },
          [`discounts.${requestedDiscountType}.usedCount`]: { $lte: totalCount - 1 },
        },
        {
          $inc: {
            [`discounts.${requestedDiscountType}.usedValue`]: discountAmount,
            [`discounts.${requestedDiscountType}.usedCount`]: 1,
          },
        },
      );

      if (!(updateResult as any)?.modifiedCount) {
        throw new BadRequestException({
          message: 'Selected discount is no longer available.',
          code: 'discount_exhausted',
        });
      }

      currentDiscountApplied = discountAmount;
      currentAmountDue = Math.max(0, baseAmountDue - discountAmount);
      await this.registrationModel.findByIdAndUpdate(registration._id, {
        $set: {
          discountType: requestedDiscountType,
          discountApplied: discountAmount,
          amountDue: currentAmountDue,
        },
      });
    }
    if (currentAmountDue <= 0) {
      throw new BadRequestException({
        message: 'No payment is due for this registration.',
        code: 'no_payment_due',
      });
    }

    const requestedWalletAmount = Math.max(
      0,
      Math.floor(Number((createPaymentDto as any)?.walletAmount) || 0),
    );
    const legacyDiscount = Math.max(
      0,
      Math.floor(Number((createPaymentDto as any)?.discount) || 0),
    );
    const requestedDiscount =
      requestedDiscountType || existingDiscountType
        ? Math.max(0, Math.floor(Number(currentDiscountApplied) || 0))
        : legacyDiscount;
    const discountDelta = Math.max(0, requestedDiscount - currentDiscountApplied);
    const dueAfterDiscount = Math.max(0, currentAmountDue - discountDelta);
    const walletToApply = Math.min(requestedWalletAmount, dueAfterDiscount);

    const manualAmount = Math.max(0, Math.floor(Number(createPaymentDto.amount) || 0));
    const bankAccountId =
      typeof createPaymentDto.bankAccount === 'string' && createPaymentDto.bankAccount
        ? createPaymentDto.bankAccount
        : null;
    const bankAccountLabel =
      typeof createPaymentDto.bankAccountLabel === 'string'
        ? createPaymentDto.bankAccountLabel.trim()
        : '';

    if (walletToApply <= 0 && manualAmount <= 0) {
      throw new BadRequestException({
        message: currentAmountDue <= 0
          ? 'No payment is due for this registration.'
          : 'Please specify a payment amount or wallet credits to apply.',
        code: currentAmountDue <= 0 ? 'no_payment_due' : 'payment_amount_required',
      });
    }

    if (manualAmount > 0 && !bankAccountId && !bankAccountLabel) {
      throw new BadRequestException({
        message: 'Bank account selection is required for manual payments.',
        code: 'bank_account_required',
      });
    }

    if (manualAmount > 0 && !screenshot) {
      throw new BadRequestException({
        message: 'Payment screenshot is required for manual payments.',
        code: 'payment_screenshot_required',
      });
    }

    const requesterId = requester?._id?.toString();

    if (walletToApply > 0) {
      if (!requesterId) {
        throw new BadRequestException({
          message: 'Authentication required.',
          code: 'wallet_auth_required',
        });
      }

      const balance = await this.walletService.getBalance(requesterId);
      if (balance.balance < walletToApply) {
        throw new BadRequestException({
          message: 'Insufficient wallet balance.',
          code: 'wallet_insufficient_balance',
        });
      }
    }

    const remainingDueForManualPayment = Math.max(
      0,
      dueAfterDiscount - walletToApply,
    );

    if (manualAmount > remainingDueForManualPayment) {
      throw new BadRequestException({
        message: 'Payment amount exceeds remaining due.',
        code: 'payment_amount_exceeds_due',
      });
    }

    const paymentMethod =
      walletToApply > 0 && manualAmount > 0
        ? 'wallet_plus_bank'
        : walletToApply > 0
          ? 'wallet_only'
          : 'bank_transfer';

    if (manualAmount <= 0) {
      if (walletToApply > 0) {
        const paymentData = {
          ...createPaymentDto,
          bankAccount: undefined,
          bankAccountLabel: bankAccountLabel || undefined,
          paymentMethod,
          walletRequested: walletToApply,
          walletApplied: 0,
          amount: 0,
          status: 'pendingApproval',
          resubmissionOf: resubmissionOf || undefined,
          resubmissionRoot: resubmissionRoot || undefined,
          resubmissionCount: resubmissionCount || 0,
        };

        const payment = new this.paymentModel(paymentData);
        const savedPayment = await payment.save();

        await this.registrationModel.findByIdAndUpdate(
          createPaymentDto.registration,
          {
            paymentId: savedPayment._id,
            payment: savedPayment._id,
            latestPaymentId: savedPayment._id,
            latestPaymentStatus: 'pendingApproval',
            latestPaymentCreatedAt: savedPayment.createdAt,
            latestPaymentType: savedPayment.paymentType,
          },
        );

        await notifyUserPaymentSubmitted(savedPayment);
        await notifyAdminOnReupload(savedPayment);

        return {
          statusCode: 200,
          message: 'Payment submitted for approval.',
          data: {
            registrationId: createPaymentDto.registration,
            paymentId: savedPayment._id,
            walletRequested: walletToApply,
            amountDue: currentAmountDue,
            pendingApproval: true,
          },
        };
      }
      throw new BadRequestException({
        message: 'Payment amount is required.',
        code: 'payment_amount_required',
      });
    }

    // Use computed/legacy discount value
    const discount = requestedDiscount || 0;

    // Create payment with discount
    const paymentData = {
      ...createPaymentDto,
      bankAccount: bankAccountId || undefined,
      bankAccountLabel: bankAccountLabel || undefined,
      paymentMethod,
      walletRequested: walletToApply,
      walletApplied: 0,
      discount: discount,
      resubmissionOf: resubmissionOf || undefined,
      resubmissionRoot: resubmissionRoot || undefined,
      resubmissionCount: resubmissionCount || 0,
    };

    let savedPayment: any = null;
    try {
      const payment = new this.paymentModel(paymentData);
      savedPayment = await payment.save();

      if (savedPayment && savedPayment._id) {
        const screenshotUrl = await this.storageService.uploadFile(
          savedPayment._id.toString(),
          screenshot.buffer,
          screenshot.mimetype,
        );
        savedPayment.screenshot = screenshotUrl;
        await savedPayment.save();

        // Update registration with payment ID if registration exists
        if (createPaymentDto.registration) {
          const registration = await this.registrationModel.findById(
            createPaymentDto.registration,
          );
            if (registration) {
              await this.registrationModel.findByIdAndUpdate(
                createPaymentDto.registration,
                {
                  paymentId: savedPayment._id,
                  payment: savedPayment._id,
                  latestPaymentId: savedPayment._id,
                  latestPaymentStatus: 'pendingApproval',
                  latestPaymentCreatedAt: savedPayment.createdAt,
                  latestPaymentType: savedPayment.paymentType,
                },
              );
            }
        }
      }

      await notifyUserPaymentSubmitted(savedPayment);
      await notifyAdminOnReupload(savedPayment);

      return savedPayment;
    } catch (err) {
      if (savedPayment?._id) {
        try {
          await this.paymentModel.deleteOne({ _id: savedPayment._id });
        } catch (e) {
          console.log('Failed to delete payment after error:', e);
        }
      }

      throw err;
    }
  }

  async approvePayment(id: string, admin?: User): Promise<Payment> {
    const payment = await this.paymentModel.findById(id);
    if (!payment) {
      throw new BadRequestException('Payment not found');
    }
    if (payment.status === 'approved') {
      return payment;
    }
    if (payment.status === 'rejected') {
      throw new BadRequestException({
        message: 'Rejected payments cannot be approved.',
        code: 'payment_rejected',
      });
    }

    let registration: any = null;
    let remainingDue: number | null = null;
    let registrationUserId: string | null = null;
    let registrationUser: any = null;
    if (payment.registration) {
      registration = await this.registrationModel.findById(payment.registration);
      const registrationStatus = String((registration as any)?.status || '');
      const cancelledAt = (registration as any)?.cancelledAt;
      const refundStatus = String((registration as any)?.refundStatus || 'none');
      if (cancelledAt) {
        throw new BadRequestException({
          message: 'Cancelled registrations cannot be approved.',
          code: 'payment_registration_cancelled',
        });
      }
      if (['pending', 'processing', 'refunded'].includes(refundStatus)) {
        throw new BadRequestException({
          message: 'Refunded or refunding registrations cannot be approved.',
          code: 'payment_registration_refund_locked',
        });
      }
      if (!['payment', 'confirmed'].includes(registrationStatus)) {
        throw new BadRequestException({
          message: 'Registration is not eligible for payment approval.',
          code: 'payment_registration_ineligible',
        });
      }
      const waitlistOfferStatus = String((registration as any)?.waitlistOfferStatus || 'none');
      const waitlistOfferExpiresAt = (registration as any)?.waitlistOfferExpiresAt;
      const now = new Date();
      if (
        waitlistOfferStatus === 'accepted' &&
        waitlistOfferExpiresAt &&
        new Date(waitlistOfferExpiresAt) <= now
      ) {
        const waitlistReason = await this.resolveRejectionReason('waitlist_offer_expired', {
          requireActive: false,
        });
        const waitlistNote = this.buildRejectionPublicNote(waitlistReason);
        await this.rejectPaymentSystem(payment._id.toString(), 'waitlist_offer_expired', waitlistNote);
        await this.registrationModel.findByIdAndUpdate(payment.registration, {
          status: 'waitlisted',
          waitlistAt: now,
          waitlistOfferStatus: 'expired',
          waitlistOfferResponse: 'declined',
          waitlistOfferSentAt: null,
          waitlistOfferAcceptedAt: null,
          waitlistOfferExpiresAt: null,
        });
        const flagshipId = (registration as any)?.flagship || (registration as any)?.flagshipId;
        if (flagshipId) {
          const bucket = resolveSeatBucket((registration as any)?.userGender);
          await this.flagshipModel.findByIdAndUpdate(String(flagshipId), {
            $inc: getSeatCounterUpdate(bucket, 'waitlisted', 1),
          });
        }
        throw new BadRequestException({
          message: 'Waitlist offer expired before payment approval.',
          code: 'waitlist_offer_expired',
        });
      }
      const regUserId = registration?.userId || registration?.user;
      if (regUserId) {
        registrationUserId = regUserId.toString();
        registrationUser = await this.user.findById(regUserId);
        if (registrationUser) {
          ensureUserVerifiedForPayment(registrationUser);
        }
      }
    }

    if (registration) {
      const latestPaymentId =
        registration?.latestPaymentId?.toString?.() || String(registration?.latestPaymentId || '');
      const currentPaymentId = payment._id?.toString?.() || String(payment._id);
      const latestStatus = String((registration as any)?.latestPaymentStatus || '');
      const regStatus = String((registration as any)?.status || '');
      const regSeatLocked = Boolean((registration as any)?.seatLocked);
      const regPaid = Boolean((registration as any)?.isPaid);
      if (latestPaymentId && currentPaymentId && latestPaymentId === currentPaymentId
        && latestStatus === 'approved'
        && regStatus === 'confirmed'
        && regSeatLocked
        && regPaid) {
        // Registration already reflects approval for this payment, so we skip wallet/registration
        // mutations and just align the payment record itself.
        payment.status = 'approved';
        const snapshotDue =
          typeof (registration as any)?.amountDue === 'number'
            ? (registration as any).amountDue
            : undefined;
        if (typeof snapshotDue === 'number') {
          (payment as any).remainingDueAtDecision = snapshotDue;
        }
        const requestedWallet =
          typeof (payment as any)?.walletRequested === 'number'
            ? (payment as any).walletRequested
            : 0;
        const appliedWallet =
          typeof (payment as any)?.walletApplied === 'number'
            ? (payment as any).walletApplied
            : 0;
        if (requestedWallet > 0 && appliedWallet < requestedWallet) {
          payment.walletApplied = requestedWallet;
        }
        await payment.save();
        return payment;
      }
    }

    if (registration) {
      const currentAmountDue =
        typeof registration.amountDue === 'number'
          ? registration.amountDue
        : typeof registration.price === 'number'
            ? registration.price
            : 0;
      if (currentAmountDue <= 0) {
        await this.rejectPaymentSystem(payment._id.toString(), 'no_payment_due');
        throw new BadRequestException({
          message: 'No payment is due for this registration.',
          code: 'no_payment_due',
        });
      }
      const currentDiscountApplied =
        typeof registration.discountApplied === 'number'
          ? registration.discountApplied
          : 0;
      const currentWalletPaid =
        typeof registration.walletPaid === 'number'
          ? registration.walletPaid
          : 0;
      const paymentDiscount =
        typeof (payment as any)?.discount === 'number'
          ? (payment as any).discount
          : 0;
      const targetDiscount = Math.max(0, paymentDiscount);
      const discountDelta = Math.max(0, targetDiscount - currentDiscountApplied);

      const paymentWalletRequested =
        typeof (payment as any)?.walletRequested === 'number'
          ? (payment as any).walletRequested
          : 0;
      const paymentWalletApplied =
        typeof (payment as any)?.walletApplied === 'number'
          ? (payment as any).walletApplied
          : 0;
      const walletToApply =
        paymentWalletRequested > 0 && paymentWalletApplied < paymentWalletRequested
          ? paymentWalletRequested
          : 0;

      let walletDebited = false;
      let walletSourceId: string | null = null;
      let walletTx: any = null;

      try {
        if (walletToApply > 0) {
          if (!registrationUserId) {
            throw new BadRequestException({
              message: 'User not found for wallet debit.',
              code: 'wallet_user_missing',
            });
          }
          if (!payment.walletDebitId) {
            const newDebitId = `payment:${payment._id.toString()}:${Date.now()}:${Math.random()
              .toString(36)
              .slice(2, 8)}`;
            const updated = await this.paymentModel.findOneAndUpdate(
              {
                _id: payment._id,
                $or: [
                  { walletDebitId: { $exists: false } },
                  { walletDebitId: null },
                  { walletDebitId: '' },
                ],
              },
              { $set: { walletDebitId: newDebitId } },
              { new: true },
            );
            if (updated?.walletDebitId) {
              payment.walletDebitId = updated.walletDebitId as string;
            } else {
              const latest = await this.paymentModel
                .findById(payment._id)
                .select('walletDebitId')
                .lean()
                .exec();
              payment.walletDebitId = (latest as any)?.walletDebitId || newDebitId;
            }
          }
          walletSourceId = payment.walletDebitId;
          try {
            walletTx = await this.walletService.debit({
              userId: registrationUserId,
              amount: walletToApply,
              type: 'flagship_payment_wallet_debit',
              sourceId: walletSourceId,
              sourceType: 'flagship_payment',
              metadata: {
                paymentId: payment._id?.toString(),
                registrationId: registration._id?.toString(),
                walletApplied: walletToApply,
              },
            });
          } catch (err: any) {
            const code = err?.response?.data?.code || err?.code || err?.message;
            if (code === 'wallet_tx_void') {
              const newDebitId = `payment:${payment._id.toString()}:${Date.now()}:${Math.random()
                .toString(36)
                .slice(2, 8)}`;
              await this.paymentModel.findByIdAndUpdate(payment._id, {
                walletDebitId: newDebitId,
              });
              payment.walletDebitId = newDebitId;
              walletSourceId = newDebitId;
              walletTx = await this.walletService.debit({
                userId: registrationUserId,
                amount: walletToApply,
                type: 'flagship_payment_wallet_debit',
                sourceId: walletSourceId,
                sourceType: 'flagship_payment',
                metadata: {
                  paymentId: payment._id?.toString(),
                  registrationId: registration._id?.toString(),
                  walletApplied: walletToApply,
                },
              });
            } else {
              throw err;
            }
          }
          const idempotentWalletTx = isWalletTxIdempotent(walletTx);
          walletDebited = !idempotentWalletTx;
          if (idempotentWalletTx) {
            const refreshed = await this.registrationModel
              .findById(registration._id)
              .select('latestPaymentId latestPaymentStatus status seatLocked isPaid')
              .lean()
              .exec();
            const refreshedLatestId =
              (refreshed as any)?.latestPaymentId?.toString?.() ||
              String((refreshed as any)?.latestPaymentId || '');
            const refreshedStatus = String((refreshed as any)?.latestPaymentStatus || '');
            const refreshedRegStatus = String((refreshed as any)?.status || '');
            const refreshedSeatLocked = Boolean((refreshed as any)?.seatLocked);
            const refreshedPaid = Boolean((refreshed as any)?.isPaid);
            if (refreshedLatestId && refreshedLatestId === String(payment._id)
              && refreshedStatus === 'approved'
              && refreshedRegStatus === 'confirmed'
              && refreshedSeatLocked
              && refreshedPaid) {
              payment.status = 'approved';
              if (paymentWalletRequested > 0 && paymentWalletApplied < paymentWalletRequested) {
                payment.walletApplied = paymentWalletRequested;
              }
              await payment.save();
              return payment;
            }
          }
        }

        const updatedDiscountApplied = currentDiscountApplied + discountDelta;
        const newAmountDue = Math.max(
          0,
          currentAmountDue - payment.amount - discountDelta - walletToApply,
        );
        remainingDue = newAmountDue;

        // Wrap seat lock + registration update + payment save in a transaction
        // so they either all commit or all roll back atomically.
        const txnSession = await this.connection.startSession();
        try {
          await txnSession.withTransaction(async () => {
            const seatAlreadyLocked = Boolean(registration?.seatLocked);
            if (!seatAlreadyLocked) {
              const flagshipId = registration.flagship || registration.flagshipId;
              const userGender = registration.userGender || registrationUser?.gender;
              const bucket = resolveSeatBucket(userGender);
              const seatLocked = await this.tryLockSeat(String(flagshipId), bucket, txnSession);
              if (!seatLocked) {
                const seatFullReason = await this.resolveRejectionReason('seats_full', {
                  requireActive: false,
                });
                const seatFullNote = this.buildRejectionPublicNote(seatFullReason);
                await this.paymentModel.findByIdAndUpdate(payment._id, {
                  status: 'rejected',
                  rejectionCode: 'seats_full',
                  rejectionPublicNote: seatFullNote,
                }, { session: txnSession });
                await this.registrationModel.findByIdAndUpdate(payment.registration, {
                  status: 'waitlisted',
                  waitlistAt: new Date(),
                  waitlistOfferStatus: 'none',
                  waitlistOfferResponse: null,
                  waitlistOfferSentAt: null,
                  waitlistOfferAcceptedAt: null,
                  waitlistOfferExpiresAt: null,
                  paymentId: null,
                  payment: null,
                  latestPaymentId: payment._id,
                  latestPaymentStatus: 'rejected',
                  latestPaymentCreatedAt: payment.createdAt,
                  latestPaymentType: payment.paymentType,
                }, { session: txnSession });
                await this.releaseDiscountForRegistration(registration, txnSession);
                await this.flagshipModel.findByIdAndUpdate(String(flagshipId), {
                  $inc: getSeatCounterUpdate(bucket, 'waitlisted', 1),
                }, { session: txnSession });
                if (registrationUserId) {
                  try {
                    await this.notificationService.createForUser(registrationUserId, {
                      title: 'Seats full - moved to waitlist',
                      message: 'Seats are currently full. You have been moved to the waitlist and will be notified when a seat opens.',
                      type: 'waitlist',
                      link: '/passport',
                      metadata: {
                        registrationId: registration?._id?.toString?.(),
                        flagshipId: String(flagshipId),
                      },
                    });
                  } catch (error) {
                    console.log('Failed to notify user about waitlist move:', error);
                  }
                }
                throw new BadRequestException({
                  message: 'Seats are full. User moved to waitlist.',
                  code: 'seats_full_waitlisted',
                });
              }
            }

            const registrationUpdate: any = {
              isPaid: true,
              amountDue: newAmountDue,
              discountApplied: updatedDiscountApplied,
              status: 'confirmed',
              seatLocked: true,
              seatLockedAt: new Date(),
              payment: payment._id,
              paymentId: payment._id,
              latestPaymentId: payment._id,
              latestPaymentStatus: 'approved',
              latestPaymentCreatedAt: payment.createdAt,
              latestPaymentType: payment.paymentType,
            };
            if (walletToApply > 0) {
              registrationUpdate.walletPaid = Math.max(
                0,
                currentWalletPaid + walletToApply,
              );
            }

            await this.registrationModel.findByIdAndUpdate(
              payment.registration,
              registrationUpdate,
              { session: txnSession },
            );

            payment.status = 'approved';
            if (typeof remainingDue === 'number') {
              (payment as any).remainingDueAtDecision = remainingDue;
            }
            if (this.isAdminUser(admin)) {
              payment.reviewedBy = admin?._id as any;
              payment.reviewedAt = new Date();
            }
            if (walletToApply > 0) {
              payment.walletApplied = Math.max(
                paymentWalletApplied,
                paymentWalletRequested,
              );
            }
            await payment.save({ session: txnSession });
          });
        } finally {
          await txnSession.endSession();
        }
      } catch (err) {
        if (walletDebited && walletSourceId) {
          try {
            await this.walletService.voidBySource({
              type: 'flagship_payment_wallet_debit',
              sourceId: walletSourceId,
              voidedBy: registrationUserId || undefined,
              note: 'Rolled back wallet debit due to approval failure',
            });
            payment.walletDebitId = '';
            await payment.save();
          } catch (e) {
            console.log('Failed to rollback wallet debit after approval error:', e);
          }
        }
        throw err;
      }
    }

    // Send payment approved email if user has an email
    try {
      // Get populated payment data for email
      const populatedPayment = await this.paymentModel
        .findById(id)
        .populate({
          path: 'registration',
          populate: [{ path: 'user' }, { path: 'flagship' }],
        })
        .exec();

      if (populatedPayment && populatedPayment.registration) {
        const reg = populatedPayment.registration as any;
        const user = reg.user;
        const flagship = reg.flagship;
        const registrationId = reg?._id?.toString();
        const userId = user?._id ? String(user._id) : user?.toString?.();
        const tripName = flagship?.tripName;
        const flagshipId = flagship?._id?.toString?.() ?? flagship?.toString?.();
        const paymentUrl =
          process.env.FRONTEND_URL && registrationId
            ? `${process.env.FRONTEND_URL}/musafir/payment/${registrationId}`
            : undefined;

        if (userId && tripName) {
          try {
            await this.notificationService.createForUser(userId, {
              title: 'Payment approved',
              message:
                typeof remainingDue === 'number' && remainingDue > 0
                  ? `Your payment for ${tripName} was approved. Remaining due: Rs.${remainingDue.toLocaleString()}.`
                  : `Your payment for ${tripName} was approved. Your seat is confirmed.`,
              type: 'payment',
              link:
                typeof remainingDue === 'number' && remainingDue > 0 && registrationId
                  ? `/musafir/payment/${registrationId}`
                  : '/passport',
              metadata: {
                paymentId: payment._id?.toString(),
                registrationId: reg._id?.toString(),
                flagshipId,
                amount: payment.amount,
                remainingDue: typeof remainingDue === 'number' ? remainingDue : undefined,
              },
            });
          } catch (error) {
            console.log('Failed to create payment approved notification:', error);
          }
        }

        if (user && typeof user.email === 'string' && user.email && tripName) {
          try {
            await this.mailService.sendPaymentApprovedEmail(
              user.email,
              user.fullName || 'Musafir',
              payment.amount,
              tripName,
              payment.createdAt,
              {
                remainingDue:
                  typeof remainingDue === 'number' ? remainingDue : undefined,
                paymentUrl,
              },
            );
          } catch (error) {
            console.log('Failed to send payment approved email:', error);
          }
        }
      }
    } catch (error) {
      console.log('Failed to load payment data for approved payment notifications:', error);
      // Don't throw error - notification/email failure shouldn't prevent payment approval
    }

    return payment;
  }

  private async rejectPaymentInternal(
    id: string,
    options: {
      rejectionCode: string;
      publicNote?: string;
      internalNote?: string;
      admin?: User;
      requireActive?: boolean;
    },
  ): Promise<Payment> {
    const reason = await this.resolveRejectionReason(options.rejectionCode, {
      requireActive: options.requireActive,
    });
    const rejectionPublicNote = this.buildRejectionPublicNote(
      reason,
      options.publicNote,
    );
    const rejectionLabel = this.buildRejectionLabel(reason, options.rejectionCode);

    const update: any = {
      status: 'rejected',
      rejectionCode: options.rejectionCode,
      rejectionLabel,
      rejectionPublicNote,
    };
    if (options.internalNote) {
      update.rejectionInternalNote = options.internalNote;
    }
    if (this.isAdminUser(options.admin)) {
      update.reviewedBy = (options.admin as any)?._id;
      update.reviewedAt = new Date();
    }

    const payment = await this.paymentModel.findByIdAndUpdate(
      id,
      update,
      { new: true },
    );
    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    if (payment.registration) {
      await this.registrationModel.findByIdAndUpdate(payment.registration, {
        isPaid: false,
        paymentId: null,
        payment: null,
        latestPaymentId: payment._id,
        latestPaymentStatus: 'rejected',
        latestPaymentCreatedAt: payment.createdAt,
        latestPaymentType: payment.paymentType,
      });

      try {
        const registration = await this.registrationModel
          .findById(payment.registration)
          .lean()
          .exec();
        if (registration) {
          await this.releaseDiscountForRegistration(registration);
        }
      } catch (error) {
        console.log('Failed to release discount after payment rejection:', error);
      }

      try {
        const updatedRegistration: any = await this.registrationModel
          .findById(payment.registration)
          .select('amountDue')
          .lean()
          .exec();
        if (typeof updatedRegistration?.amountDue === 'number') {
          await this.paymentModel.updateOne(
            { _id: payment._id },
            { $set: { remainingDueAtDecision: updatedRegistration.amountDue } },
          );
          (payment as any).remainingDueAtDecision = updatedRegistration.amountDue;
        }
      } catch (error) {
        console.log('Failed to snapshot remaining due after rejection:', error);
      }

      // Notify user about rejection (in-app always, email when available).
      try {
        const populatedPayment = await this.paymentModel
          .findById(id)
          .populate({
            path: 'registration',
            populate: [{ path: 'user' }, { path: 'flagship' }],
          })
          .exec();

        if (populatedPayment && populatedPayment.registration) {
          const reg = populatedPayment.registration as any;
          const user = reg.user;
          const flagship = reg.flagship;
          const userId = user?._id ? String(user._id) : user?.toString?.();
          const tripName = flagship?.tripName;
          const flagshipId = flagship?._id?.toString?.() ?? flagship?.toString?.();
          const isWaitlistExpired = options.rejectionCode === 'waitlist_offer_expired';
          const isNoPaymentDue = options.rejectionCode === 'no_payment_due';

          if (userId && tripName) {
            const normalizedLabel = rejectionLabel?.toLowerCase?.() || '';
            const normalizedNote = rejectionPublicNote?.toLowerCase?.() || '';
            const shouldPrefix =
              rejectionLabel &&
              rejectionPublicNote &&
              rejectionPublicNote !== rejectionLabel &&
              (!normalizedLabel || !normalizedNote.includes(normalizedLabel));
            const messageDetail = shouldPrefix
              ? `${rejectionLabel}. ${rejectionPublicNote}`
              : rejectionPublicNote || rejectionLabel;
            const dueSuffix =
              typeof (payment as any).remainingDueAtDecision === 'number'
                ? ` Remaining due: Rs.${Number((payment as any).remainingDueAtDecision).toLocaleString()}.`
                : '';
            const rejectionMessage = messageDetail
              ? `Your payment for ${tripName} was rejected. ${messageDetail}.${dueSuffix}`
              : `Your payment for ${tripName} was rejected. Please resubmit your payment to confirm your seat.${dueSuffix}`;
            const rejectionLink =
              isWaitlistExpired || isNoPaymentDue
                ? '/passport'
                : reg?._id
                  ? `/musafir/payment/${String(reg._id)}`
                  : '/passport';
            try {
              await this.notificationService.createForUser(userId, {
                title: 'Payment rejected',
                message: rejectionMessage,
                type: 'payment',
                link: rejectionLink,
                metadata: {
                  paymentId: payment._id?.toString(),
                  registrationId: reg?._id?.toString(),
                  flagshipId,
                  amount: payment.amount,
                  rejectionCode: options.rejectionCode,
                  rejectionPublicNote,
                  remainingDue: (payment as any).remainingDueAtDecision,
                },
              });
            } catch (error) {
              console.log('Failed to create payment rejected notification:', error);
            }
          }

          if (user && typeof user.email === 'string' && user.email && tripName) {
            try {
              const normalizedLabel = rejectionLabel?.toLowerCase?.() || '';
              const normalizedNote = rejectionPublicNote?.toLowerCase?.() || '';
              const shouldPrefix =
                rejectionLabel &&
                rejectionPublicNote &&
                rejectionPublicNote !== rejectionLabel &&
                (!normalizedLabel || !normalizedNote.includes(normalizedLabel));
              const emailReason = shouldPrefix
                ? `${rejectionLabel}. ${rejectionPublicNote}`
                : rejectionPublicNote || rejectionLabel;
              await this.mailService.sendPaymentRejectedEmail(
                user.email,
                user.fullName || 'Musafir',
                payment.amount,
                tripName,
                emailReason,
                typeof (payment as any).remainingDueAtDecision === 'number'
                  ? (payment as any).remainingDueAtDecision
                  : undefined,
              );
            } catch (error) {
              console.log('Failed to send payment rejected email:', error);
            }
          }
        }
      } catch (error) {
        console.log(
          'Failed to load payment data for rejected payment notifications:',
          error,
        );
      }
    }

    return payment;
  }

  async rejectPayment(id: string, payload: RejectPaymentDto, admin?: User): Promise<Payment> {
    if (!payload?.rejectionCode) {
      throw new BadRequestException('Rejection code is required.');
    }
    if (!this.isAdminUser(admin)) {
      throw new ForbiddenException('Admin authentication required.');
    }
    return this.rejectPaymentInternal(id, {
      rejectionCode: payload.rejectionCode,
      publicNote: payload.publicNote,
      internalNote: payload.internalNote,
      admin,
      requireActive: true,
    });
  }

  private async rejectPaymentSystem(id: string, rejectionCode: string, publicNote?: string) {
    return this.rejectPaymentInternal(id, {
      rejectionCode,
      publicNote,
      requireActive: false,
    });
  }

  async getPendingPayments(): Promise<Payment[]> {
    return this.paymentModel
      .find({ status: 'pendingApproval' })
      .populate({
        path: 'registration',
        populate: [{ path: 'user' }, { path: 'flagship' }],
      })
      .populate('bankAccount')
      .exec();
  }

  async getCompletedPayments(): Promise<Payment[]> {
    return this.paymentModel
      .find({ status: 'approved' })
      .populate({
        path: 'registration',
        populate: [{ path: 'user' }, { path: 'flagship' }],
      })
      .populate('bankAccount')
      .exec();
  }

  async approveRefund(
    id: string,
    options?: { credit?: boolean; admin?: User },
  ): Promise<Refund> {
    const credit = options?.credit !== false;
    const adminId = options?.admin?._id?.toString();

    const refundDoc: any = await this.refundModel.findById(id).exec();
    if (!refundDoc) {
      throw new BadRequestException('Refund not found');
    }
    if (refundDoc.status === 'rejected') {
      throw new BadRequestException({
        message: 'Rejected refunds cannot be approved.',
        code: 'refund_already_rejected',
      });
    }
    if (refundDoc.status === 'cleared') {
      throw new BadRequestException({
        message: 'Refund is already approved. Use payout actions instead.',
        code: 'refund_already_approved',
      });
    }
    if (refundDoc.status !== 'pending') {
      throw new BadRequestException({
        message: 'Refund is not eligible for approval.',
        code: 'refund_not_pending',
      });
    }

    const registration: any = refundDoc?.registration
      ? await this.registrationModel.findById(refundDoc.registration).lean().exec()
      : null;
    const registrationUserId = registration?.userId || registration?.user;
    if (!registration || !registrationUserId) {
      throw new BadRequestException({
        message: 'Refund registration/user not found.',
        code: 'refund_registration_not_found',
      });
    }

    const flagshipId = registration?.flagship || registration?.flagshipId;
    const flagship: any = flagshipId
      ? await this.flagshipModel.findById(flagshipId).select('startDate tripName').lean().exec()
      : null;

    const existingSettlements = await this.refundSettlementService.findByRefundIds([id]);
    const existingSettlement = this.pickRefundSettlement(existingSettlements);
    const desiredMethod = credit ? 'wallet_credit' : 'bank_refund';
    if (existingSettlement?.method && existingSettlement.method !== desiredMethod) {
      throw new BadRequestException({
        message: 'Refund payout method already selected for this refund.',
        code: 'refund_method_conflict',
      });
    }
    if (existingSettlement?.status === 'posted') {
      throw new BadRequestException({
        message: 'Refund was already settled.',
        code: 'refund_already_settled',
      });
    }
    if (existingSettlement?.status === 'pending') {
      throw new BadRequestException({
        message: 'Refund payout is already in progress.',
        code: 'refund_payout_in_progress',
      });
    }

    const snapshot = await this.ensureRefundSnapshot(refundDoc, registration, flagship);
    const refundAmount = Math.max(0, Math.floor(Number(snapshot.refundAmount) || 0));

    refundDoc.status = 'cleared';
    const savedRefund: any = await refundDoc.save();

    const userId = registrationUserId ? String(registrationUserId) : undefined;
    if (userId) {
      if (credit) {
        await this.refundSettlementService.ensureSettlement({
          refundId: id,
          userId,
          amount: refundAmount,
          method: 'wallet_credit',
          status: 'pending',
          metadata: { mode: 'approve_and_credit' },
        });

        if (refundAmount > 0) {
          try {
            await this.refundSettlementService.postToWallet({
              refundId: id,
              userId,
              amount: refundAmount,
              postedBy: adminId,
            });
          } catch (error) {
            console.log('Failed to post refund credit:', error);
            throw new BadRequestException({
              message: 'Refund approved, but wallet credit failed. Retry posting credit.',
              code: 'refund_credit_failed',
            });
          }
        }

        await this.refundSettlementService.ensureSettlement({
          refundId: id,
          userId,
          amount: refundAmount,
          method: 'wallet_credit',
          status: 'posted',
          postedBy: adminId,
          postedAt: new Date(),
          metadata: { mode: 'approve_and_credit' },
        });
        await this.finalizeRegistrationRefund(registration, registrationUserId);
      } else {
        await this.refundSettlementService.ensureSettlement({
          refundId: id,
          userId,
          amount: refundAmount,
          method: 'bank_refund',
          status: 'pending',
          postedBy: adminId,
          metadata: {
            mode: 'approve_defer_credit',
            bankDetails: refundDoc?.bankDetails || undefined,
          },
        });
      }

      try {
        const tripName = flagship?.tripName || 'your trip';
        const registrationId = registration?._id?.toString();
        const statusLink = registrationId ? `/musafir/refund/${registrationId}` : '/passport';
        const hasAmount = refundAmount > 0;

        await this.notificationService.createForUser(userId, {
          title: 'Refund approved',
          message: credit
            ? hasAmount
              ? `Your refund for ${tripName} was approved and credited to your wallet (Rs.${refundAmount.toLocaleString()}).`
              : `Your refund for ${tripName} was approved. No refund is due based on policy.`
            : `Your refund for ${tripName} was approved. Bank transfer is pending.`,
          type: 'refund',
          link: credit ? '/wallet' : statusLink,
          metadata: {
            refundId: savedRefund._id?.toString(),
            registrationId: registration?._id?.toString(),
            amount: refundAmount,
            credited: credit && hasAmount,
            method: credit ? 'wallet_credit' : 'bank_refund',
          },
        });

        const userDoc: any = await this.user
          .findById(userId)
          .select('email fullName')
          .lean()
          .exec();

        if (userDoc?.email) {
          if (credit && hasAmount) {
            await this.mailService.sendMail(
              userDoc.email,
              'Your 3Musafir refund has been credited',
              './refund-credited',
              {
                fullName: userDoc.fullName || 'Musafir',
                tripName,
                amount: refundAmount,
              },
            );
          } else if (!credit) {
            await this.mailService.sendMail(
              userDoc.email,
              'Your 3Musafir refund is approved (bank transfer pending)',
              './refund-approved-pending-bank',
              {
                fullName: userDoc.fullName || 'Musafir',
                tripName,
                amount: refundAmount,
              },
            );
          }
        }
      } catch (error) {
        console.log('Failed to send refund approved comms:', error);
      }
    }

    return savedRefund;
  }

  async postRefundCredit(refundId: string, admin: User) {
    const adminId = admin?._id?.toString();
    if (!adminId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'refund_admin_auth_required',
      });
    }

    const refundDoc: any = await this.refundModel.findById(refundId).exec();
    if (!refundDoc) {
      throw new BadRequestException('Refund not found');
    }
    if (refundDoc.status === 'rejected') {
      throw new BadRequestException({
        message: 'Rejected refunds cannot be credited.',
        code: 'refund_rejected',
      });
    }
    if (refundDoc.status !== 'cleared') {
      throw new BadRequestException({
        message: 'Refund must be approved before posting credit.',
        code: 'refund_not_approved',
      });
    }

    const registration: any = refundDoc?.registration
      ? await this.registrationModel.findById(refundDoc.registration).lean().exec()
      : null;
    const userId = (registration?.userId || registration?.user)?.toString?.();
    if (!userId) {
      throw new BadRequestException({
        message: 'Refund registration/user not found.',
        code: 'refund_registration_not_found',
      });
    }

    const flagshipId = registration?.flagship || registration?.flagshipId;
    const flagship: any = flagshipId
      ? await this.flagshipModel.findById(flagshipId).select('startDate tripName').lean().exec()
      : null;
    const snapshot = await this.ensureRefundSnapshot(refundDoc, registration, flagship);
    if (snapshot.updated) {
      await refundDoc.save();
    }

    const settlements = await this.refundSettlementService.findByRefundIds([refundId]);
    const existingSettlement = this.pickRefundSettlement(settlements);
    if (existingSettlement?.method && existingSettlement.method !== 'wallet_credit') {
      throw new BadRequestException({
        message: 'Refund payout method is not wallet credit.',
        code: 'refund_method_conflict',
      });
    }
    if (existingSettlement?.status === 'posted') {
      throw new BadRequestException({
        message: 'Refund was already credited.',
        code: 'refund_already_settled',
      });
    }

    const amount = Math.max(0, Math.floor(Number(snapshot.refundAmount) || 0));
    await this.refundSettlementService.ensureSettlement({
      refundId: refundId,
      userId,
      amount,
      method: 'wallet_credit',
      status: 'pending',
      postedBy: adminId,
      metadata: { mode: 'post_credit' },
    });

    if (amount > 0) {
      await this.refundSettlementService.postToWallet({
        refundId: refundId,
        userId,
        amount,
        postedBy: adminId,
      });
    }

    await this.refundSettlementService.ensureSettlement({
      refundId: refundId,
      userId,
      amount,
      method: 'wallet_credit',
      status: 'posted',
      postedBy: adminId,
      postedAt: new Date(),
      metadata: { mode: 'post_credit' },
    });

    await this.finalizeRegistrationRefund(registration, userId);

    try {
      const tripName = flagship?.tripName || 'your trip';
      const hasAmount = amount > 0;
      const registrationId = registration?._id?.toString?.();
      const statusLink = registrationId ? `/musafir/refund/${registrationId}` : '/passport';

      await this.notificationService.createForUser(userId, {
        title: hasAmount ? 'Refund credited' : 'Refund settled',
        message: hasAmount
          ? `Rs.${amount.toLocaleString()} has been credited to your wallet.`
          : `Your refund for ${tripName} has been settled.`,
        type: 'refund',
        link: hasAmount ? '/wallet' : statusLink,
        metadata: { refundId: refundId, amount, method: 'wallet_credit' },
      });

      const userDoc: any = await this.user
        .findById(userId)
        .select('email fullName')
        .lean()
        .exec();
      if (userDoc?.email && hasAmount) {
        await this.mailService.sendMail(
          userDoc.email,
          'Your 3Musafir refund has been credited',
          './refund-credited',
          {
            fullName: userDoc.fullName || 'Musafir',
            tripName,
            amount,
          },
        );
      }
    } catch (error) {
      console.log('Failed to send refund credited notification:', error);
    }

    return { status: 'posted', refundId, amount };
  }

  async postRefundBank(refundId: string, admin: User) {
    const adminId = admin?._id?.toString();
    if (!adminId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'refund_admin_auth_required',
      });
    }

    const refundDoc: any = await this.refundModel.findById(refundId).exec();
    if (!refundDoc) {
      throw new BadRequestException('Refund not found');
    }
    if (refundDoc.status === 'rejected') {
      throw new BadRequestException({
        message: 'Rejected refunds cannot be processed.',
        code: 'refund_rejected',
      });
    }
    if (refundDoc.status !== 'cleared') {
      throw new BadRequestException({
        message: 'Refund must be approved before posting bank payout.',
        code: 'refund_not_approved',
      });
    }

    const registration: any = refundDoc?.registration
      ? await this.registrationModel.findById(refundDoc.registration).lean().exec()
      : null;
    const userId = (registration?.userId || registration?.user)?.toString?.();
    if (!userId) {
      throw new BadRequestException({
        message: 'Refund registration/user not found.',
        code: 'refund_registration_not_found',
      });
    }

    const flagshipId = registration?.flagship || registration?.flagshipId;
    const flagship: any = flagshipId
      ? await this.flagshipModel.findById(flagshipId).select('startDate tripName').lean().exec()
      : null;
    const snapshot = await this.ensureRefundSnapshot(refundDoc, registration, flagship);
    if (snapshot.updated) {
      await refundDoc.save();
    }

    const settlements = await this.refundSettlementService.findByRefundIds([refundId]);
    const existingSettlement = this.pickRefundSettlement(settlements);
    if (existingSettlement?.method && existingSettlement.method !== 'bank_refund') {
      throw new BadRequestException({
        message: 'Refund payout method is not bank transfer.',
        code: 'refund_method_conflict',
      });
    }
    if (existingSettlement?.status === 'posted') {
      throw new BadRequestException({
        message: 'Refund was already settled.',
        code: 'refund_already_settled',
      });
    }

    const amount = Math.max(0, Math.floor(Number(snapshot.refundAmount) || 0));
    await this.refundSettlementService.ensureSettlement({
      refundId: refundId,
      userId,
      amount,
      method: 'bank_refund',
      status: 'pending',
      postedBy: adminId,
      metadata: { mode: 'post_bank', bankDetails: refundDoc?.bankDetails || undefined },
    });

    await this.refundSettlementService.ensureSettlement({
      refundId: refundId,
      userId,
      amount,
      method: 'bank_refund',
      status: 'posted',
      postedBy: adminId,
      postedAt: new Date(),
      metadata: { mode: 'post_bank', bankDetails: refundDoc?.bankDetails || undefined },
    });

    await this.finalizeRegistrationRefund(registration, userId);

    try {
      const tripName = flagship?.tripName || 'your trip';
      const registrationId = registration?._id?.toString?.();
      const statusLink = registrationId ? `/musafir/refund/${registrationId}` : '/passport';

      await this.notificationService.createForUser(userId, {
        title: 'Refund processed',
        message: `Your refund for ${tripName} has been processed to your bank details.`,
        type: 'refund',
        link: statusLink,
        metadata: { refundId: refundId, amount, method: 'bank_refund' },
      });

      const userDoc: any = await this.user
        .findById(userId)
        .select('email fullName')
        .lean()
        .exec();
      if (userDoc?.email) {
        await this.mailService.sendMail(
          userDoc.email,
          'Your 3Musafir refund has been processed',
          './refund-processed-bank',
          {
            fullName: userDoc.fullName || 'Musafir',
            tripName,
            amount,
          },
        );
      }
    } catch (error) {
      console.log('Failed to send refund bank processed notification:', error);
    }

    return { status: 'posted', refundId, amount };
  }

  async rejectRefund(id: string, payload: RejectRefundDto, admin?: User): Promise<Refund> {
    if (!payload?.rejectionCode) {
      throw new BadRequestException('Rejection code is required.');
    }
    if (!this.isAdminUser(admin)) {
      throw new ForbiddenException('Admin authentication required.');
    }

    const refundDoc: any = await this.refundModel.findById(id).exec();
    if (!refundDoc) {
      throw new BadRequestException('Refund not found');
    }
    if (refundDoc.status === 'cleared') {
      throw new BadRequestException({
        message: 'Approved refunds cannot be rejected.',
        code: 'refund_already_approved',
      });
    }
    if (refundDoc.status === 'rejected') {
      throw new BadRequestException({
        message: 'Refund is already rejected.',
        code: 'refund_already_rejected',
      });
    }

    const settlements = await this.refundSettlementService.findByRefundIds([id]);
    const existingSettlement = this.pickRefundSettlement(settlements);
    if (existingSettlement?.status === 'posted') {
      throw new BadRequestException({
        message: 'Refund was already settled.',
        code: 'refund_already_settled',
      });
    }
    if (existingSettlement?.status === 'pending') {
      throw new BadRequestException({
        message: 'Refund payout is already in progress.',
        code: 'refund_payout_in_progress',
      });
    }

    const reason = await this.resolveRefundRejectionReason(payload.rejectionCode, {
      requireActive: true,
    });
    const rejectionPublicNote = this.buildRefundRejectionPublicNote(
      reason,
      payload.publicNote,
    );
    const rejectionLabel = this.buildRefundRejectionLabel(reason, payload.rejectionCode);

    const update: any = {
      status: 'rejected',
      rejectionCode: payload.rejectionCode,
      rejectionLabel,
      rejectionPublicNote,
    };
    if (payload.internalNote) {
      update.rejectionInternalNote = payload.internalNote;
    }

    const refund = await this.refundModel.findOneAndUpdate(
      { _id: id, status: 'pending' },
      update,
      { new: true },
    );
    if (!refund) {
      throw new BadRequestException({
        message: 'Refund could not be rejected. Please retry.',
        code: 'refund_state_changed',
      });
    }

    if (refund?.registration) {
      const registration = await this.registrationModel
        .findById(refund.registration)
        .populate({ path: 'flagship', select: 'tripName' })
        .exec();

      if (registration?._id) {
        await this.registrationModel.findByIdAndUpdate(registration._id, {
          refundStatus: 'rejected',
        });
      }

      const registrationUserId = (registration as any)?.userId || (registration as any)?.user;
      const userId = registrationUserId ? String(registrationUserId) : null;
      if (userId) {
        await this.updateUserTripStats(userId);

        const retryAtDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const retryAt = retryAtDate.toISOString();
        const tripName = (registration as any)?.flagship?.tripName || 'your trip';
        const normalizedLabel = rejectionLabel?.toLowerCase?.() || '';
        const normalizedNote = rejectionPublicNote?.toLowerCase?.() || '';
        const shouldPrefix =
          rejectionLabel &&
          rejectionPublicNote &&
          rejectionPublicNote !== rejectionLabel &&
          (!normalizedLabel || !normalizedNote.includes(normalizedLabel));
        const messageDetail = shouldPrefix
          ? `${rejectionLabel}. ${rejectionPublicNote}`
          : rejectionPublicNote || rejectionLabel;
        const rejectionMessage = messageDetail
          ? `Your refund request for ${tripName} was rejected. ${messageDetail}. You can reapply after 24 hours.`
          : `Your refund request for ${tripName} was rejected. You can reapply after 24 hours.`;
        const registrationId = registration?._id?.toString?.();
        const refundLink = registrationId ? `/musafir/refund/${registrationId}` : '/passport';
        try {
          await this.notificationService.createForUser(userId, {
            title: 'Refund rejected',
            message: rejectionMessage,
            type: 'refund',
            link: refundLink,
            metadata: {
              refundId: refund._id?.toString(),
              registrationId,
                retryAt,
                rejectedBy: admin?._id?.toString(),
                rejectionCode: payload.rejectionCode,
                rejectionPublicNote,
              },
            });
        } catch (error) {
          console.log('Failed to send refund rejected notification:', error);
        }

        try {
          const userDoc: any = await this.user
            .findById(userId)
            .select('email fullName')
            .lean()
            .exec();
          if (userDoc?.email) {
            const refundUrl =
              process.env.FRONTEND_URL && registrationId
                ? `${process.env.FRONTEND_URL}/musafir/refund/${registrationId}`
                : undefined;
            await this.mailService.sendMail(
              userDoc.email,
              'Your 3Musafir refund request was rejected',
              './refund-rejected',
              {
                fullName: userDoc.fullName || 'Musafir',
                tripName,
                reason: messageDetail,
                retryAt: retryAtDate.toLocaleString('en-US'),
                refundUrl,
              },
            );
          }
        } catch (error) {
          console.log('Failed to send refund rejected email:', error);
        }
      }
    }

    return refund;
  }
}
