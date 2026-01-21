import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { BankAccount, Payment } from './interface/payment.interface';
import {
  CreateBankAccountDto,
  CreatePaymentDto,
  GetRefundsQueryDto,
  RequestRefundDto,
} from './dto/payment.dto';
import { StorageService } from 'src/storage/storageService';
import { User } from 'src/user/interfaces/user.interface';
import { Flagship } from 'src/flagship/interfaces/flagship.interface';
import { Refund } from './schema/refund.schema';
import { Registration } from 'src/registration/interfaces/registration.interface';
import { MailService } from 'src/mail/mail.service';
import { VerificationStatus } from 'src/constants/verification-status.enum';
import { NotificationService } from 'src/notifications/notification.service';
import { computeRefundQuote } from './refund-policy.util';
import { RefundSettlementService } from 'src/refund-settlement/refund-settlement.service';
import { isWalletTxIdempotent, WalletService } from 'src/wallet/wallet.service';

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
    @InjectModel('Refund')
    private readonly refundModel: Model<Refund>,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
    private readonly walletService: WalletService,
    private readonly refundSettlementService: RefundSettlementService,
  ) { }

  private assertUserVerifiedForPayment(user: User) {
    const status = (user as any)?.verification?.status;
    if (status === VerificationStatus.VERIFIED) return;
    if (status === VerificationStatus.PENDING) {
      throw new BadRequestException({
        message: 'Verification is pending. Please wait for approval before making a payment.',
        code: 'verification_pending',
      });
    }
    if (status === VerificationStatus.REJECTED) {
      throw new BadRequestException({
        message: 'Verification was rejected. Please re-apply before making a payment.',
        code: 'verification_rejected',
      });
    }
    throw new BadRequestException({
      message: 'Verification required before making a payment.',
      code: 'verification_required',
    });
  }

  private async updateUserTripStats(userId: string): Promise<void> {
    const attendedCount = await this.registrationModel.countDocuments({
      userId,
      status: 'completed',
    });

    await this.user.findByIdAndUpdate(userId, {
      numberOfFlagshipsAttended: attendedCount,
      discountApplicable: attendedCount * 500,
    });
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
    await this.registrationModel.findByIdAndUpdate(registration._id, {
      status: 'refunded',
      amountDue: 0,
      isPaid: false,
    });
    if (userId) {
      await this.updateUserTripStats(String(userId));
    }
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

    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1);
    const skip = (page - 1) * limit;

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

    if (payment) {
      const screenshotUrl = await this.storageService.getSignedUrl(
        payment._id.toString(),
      );
      payment.screenshot = screenshotUrl;
    }

    return payment;
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
    if (currentStatus !== 'cancelled' && currentStatus !== 'confirmed') {
      throw new BadRequestException({
        message: 'Please cancel your seat first before requesting a refund.',
        code: 'refund_requires_cancellation',
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
        status: { $in: ['cancelled', 'confirmed'] },
      },
      { $set: { status: 'refundProcessing' } },
      { new: false },
    );
    if (!previousRegistration) {
      throw new BadRequestException({
        message: 'Refund could not be requested. Please retry.',
        code: 'refund_state_changed',
      });
    }

    const previousStatus = String(previousRegistration?.status || 'cancelled');
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
            status: 'refundProcessing',
          },
          { $set: { status: previousStatus } },
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

    return {
      registration: {
        _id: registration._id?.toString?.() || String(registration._id),
        status: registration.status,
      },
      refund: refund || null,
      settlement,
      retryAt,
    };
  }

  async calculateUserDiscount(userId: string): Promise<number> {
    try {
      // Get all completed registrations for the user
      const completedRegistrations = await this.registrationModel.find({
        userId: userId,
        status: 'completed',
      }).exec();

      // Calculate discount: 500 per completed trip
      const discountPerTrip = 500;
      const calculatedDiscount = completedRegistrations.length * discountPerTrip;

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

    const registrationUserId = (registration as any).userId || (registration as any).user;

    const existingPending = await this.paymentModel.exists({
      registration: createPaymentDto.registration,
      status: 'pendingApproval',
    });
    if (existingPending) {
      throw new BadRequestException({
        message: 'A payment for this registration is already pending approval.',
        code: 'payment_pending_approval',
      });
    }

    if (requester && registrationUserId && registrationUserId.toString() !== requester._id?.toString()) {
      throw new ForbiddenException('You can only pay for your own registration.');
    }

    if (registrationUserId) {
      const registrationUser = await this.user.findById(registrationUserId);
      if (!registrationUser) {
        throw new BadRequestException('User for registration not found.');
      }
      this.assertUserVerifiedForPayment(registrationUser);
    }

    const originalStatus = String((registration as any)?.status || '');
    const originalIsPaid =
      typeof (registration as any)?.isPaid === 'boolean'
        ? (registration as any).isPaid
        : false;

    const originalAmountDue =
      typeof (registration as any)?.amountDue === 'number'
        ? (registration as any).amountDue
        : typeof (registration as any)?.price === 'number'
          ? (registration as any).price
          : 0;
    const originalWalletPaid =
      typeof (registration as any)?.walletPaid === 'number'
        ? (registration as any).walletPaid
        : 0;
    const originalDiscountApplied =
      typeof (registration as any)?.discountApplied === 'number'
        ? (registration as any).discountApplied
        : 0;

    let currentAmountDue =
      typeof (registration as any)?.amountDue === 'number'
        ? (registration as any).amountDue
        : typeof (registration as any)?.price === 'number'
          ? (registration as any).price
          : 0;
    let currentWalletPaid =
      typeof (registration as any)?.walletPaid === 'number'
        ? (registration as any).walletPaid
        : 0;
    let currentDiscountApplied =
      typeof (registration as any)?.discountApplied === 'number'
        ? (registration as any).discountApplied
        : 0;

    const requestedWalletAmount = Math.max(
      0,
      Math.floor(Number((createPaymentDto as any)?.walletAmount) || 0),
    );
    const requestedDiscount = Math.max(
      0,
      Math.floor(Number((createPaymentDto as any)?.discount) || 0),
    );
    const discountDelta = Math.max(0, requestedDiscount - currentDiscountApplied);
    const dueAfterDiscount = Math.max(0, currentAmountDue - discountDelta);
    const walletToApply = Math.min(requestedWalletAmount, dueAfterDiscount);

    const manualAmount = Math.max(0, Math.floor(Number(createPaymentDto.amount) || 0));

    if (walletToApply <= 0 && manualAmount <= 0) {
      throw new BadRequestException({
        message: currentAmountDue <= 0
          ? 'No payment is due for this registration.'
          : 'Please specify a payment amount or wallet credits to apply.',
        code: currentAmountDue <= 0 ? 'no_payment_due' : 'payment_amount_required',
      });
    }

    if (manualAmount > 0 && !screenshot) {
      throw new BadRequestException({
        message: 'Payment screenshot is required for manual payments.',
        code: 'payment_screenshot_required',
      });
    }

    const requesterId = requester?._id?.toString();
    const walletUseId = (createPaymentDto as any)?.walletUseId;
    let walletSourceId: string | null = null;
    let walletDebited = false;

    if (walletToApply > 0) {
      if (!requesterId) {
        throw new BadRequestException({
          message: 'Authentication required.',
          code: 'wallet_auth_required',
        });
      }
      if (!walletUseId) {
        throw new BadRequestException({
          message: 'walletUseId is required when applying wallet credits.',
          code: 'wallet_use_id_required',
        });
      }

      walletSourceId = `${createPaymentDto.registration}:${walletUseId}`;

      try {
        const walletTx: any = await this.walletService.debit({
          userId: requesterId,
          amount: walletToApply,
          type: 'flagship_payment_wallet_debit',
          sourceId: walletSourceId,
          sourceType: 'flagship_payment',
          metadata: {
            sourceId: walletSourceId,
            registrationId: createPaymentDto.registration,
            walletApplied: walletToApply,
          },
        });
        walletDebited = !isWalletTxIdempotent(walletTx);

        if (walletDebited) {
          const amountDueAfterWallet = Math.max(
            0,
            currentAmountDue - discountDelta - walletToApply,
          );
          const updated = await this.registrationModel.findByIdAndUpdate(
            createPaymentDto.registration,
            {
              amountDue: amountDueAfterWallet,
              walletPaid: Math.max(0, originalWalletPaid + walletToApply),
              discountApplied: Math.max(0, originalDiscountApplied + discountDelta),
              ...(amountDueAfterWallet === 0
                ? { status: 'confirmed', isPaid: true }
                : {}),
            },
            { new: true },
          );

          if (!updated) {
            throw new BadRequestException({
              message: 'Failed to apply wallet credits. Please retry.',
              code: 'wallet_apply_failed',
            });
          }

          currentAmountDue = amountDueAfterWallet;
          currentWalletPaid = Math.max(0, originalWalletPaid + walletToApply);
          currentDiscountApplied = Math.max(0, originalDiscountApplied + discountDelta);
        }
      } catch (err: any) {
        if (walletDebited && walletSourceId) {
          try {
            await this.walletService.voidBySource({
              type: 'flagship_payment_wallet_debit',
              sourceId: walletSourceId,
              voidedBy: requesterId,
              note: 'Rolled back wallet debit due to payment failure',
            });
          } catch (e) {
            console.log('Failed to rollback wallet debit:', e);
          }

          try {
            await this.registrationModel.findByIdAndUpdate(createPaymentDto.registration, {
              amountDue: originalAmountDue,
              walletPaid: originalWalletPaid,
              discountApplied: originalDiscountApplied,
              status: originalStatus,
              isPaid: originalIsPaid,
            });
          } catch (e) {
            console.log('Failed to rollback registration after wallet debit:', e);
          }
        }
        throw err;
      }
    }

    const remainingDueForManualPayment =
      walletToApply > 0
        ? currentAmountDue
        : Math.max(0, currentAmountDue - discountDelta);

    if (manualAmount > remainingDueForManualPayment) {
      throw new BadRequestException({
        message: 'Payment amount exceeds remaining due.',
        code: 'payment_amount_exceeds_due',
      });
    }

    if (currentAmountDue <= 0 && manualAmount <= 0) {
      return {
        statusCode: 200,
        message: 'Wallet payment applied.',
        data: {
          registrationId: createPaymentDto.registration,
          walletApplied: walletToApply,
          amountDue: currentAmountDue,
        },
      };
    }

    if (manualAmount <= 0) {
      if (walletToApply > 0) {
        return {
          statusCode: 200,
          message: 'Wallet payment applied.',
          data: {
            registrationId: createPaymentDto.registration,
            walletApplied: walletToApply,
            amountDue: currentAmountDue,
          },
        };
      }
      throw new BadRequestException({
        message: 'Payment amount is required.',
        code: 'payment_amount_required',
      });
    }

    // Use the discount provided in the DTO (0 if no discount applied)
    const discount = createPaymentDto.discount || 0;

    // Create payment with discount
    const paymentData = {
      ...createPaymentDto,
      discount: discount
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
                isPaid: true,
              },
            );
          }
        }
      }

      return savedPayment;
    } catch (err) {
      if (savedPayment?._id) {
        try {
          await this.paymentModel.deleteOne({ _id: savedPayment._id });
        } catch (e) {
          console.log('Failed to delete payment after error:', e);
        }
      }

      if (walletDebited && walletSourceId) {
        try {
          await this.walletService.voidBySource({
            type: 'flagship_payment_wallet_debit',
            sourceId: walletSourceId,
            voidedBy: requesterId,
            note: 'Rolled back wallet debit due to manual payment failure',
          });
        } catch (e) {
          console.log('Failed to rollback wallet debit after payment error:', e);
        }

        try {
          await this.registrationModel.findByIdAndUpdate(createPaymentDto.registration, {
            amountDue: originalAmountDue,
            walletPaid: originalWalletPaid,
            discountApplied: originalDiscountApplied,
            status: originalStatus,
            isPaid: originalIsPaid,
          });
        } catch (e) {
          console.log('Failed to rollback registration after payment error:', e);
        }
      }

      throw err;
    }
  }

  async approvePayment(id: string): Promise<Payment> {
    const payment = await this.paymentModel.findById(id);
    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    let registration: any = null;
    let remainingDue: number | null = null;
    if (payment.registration) {
      registration = await this.registrationModel.findById(payment.registration);
      const registrationUserId = registration?.userId || registration?.user;
      if (registrationUserId) {
        const registrationUser = await this.user.findById(registrationUserId);
        if (registrationUser) {
          this.assertUserVerifiedForPayment(registrationUser);
        }
      }
    }

    payment.status = 'approved';
    await payment.save();

    if (registration) {
      const currentAmountDue =
        typeof registration.amountDue === 'number'
          ? registration.amountDue
          : typeof registration.price === 'number'
            ? registration.price
            : 0;
      const currentDiscountApplied =
        typeof registration.discountApplied === 'number'
          ? registration.discountApplied
          : 0;
      const paymentDiscount =
        typeof (payment as any)?.discount === 'number'
          ? (payment as any).discount
          : 0;
      const targetDiscount = Math.max(0, paymentDiscount);
      const discountDelta = Math.max(0, targetDiscount - currentDiscountApplied);

      const updatedDiscountApplied = currentDiscountApplied + discountDelta;
      const newAmountDue = Math.max(
        0,
        currentAmountDue - payment.amount - discountDelta,
      );
      remainingDue = newAmountDue;

      await this.registrationModel.findByIdAndUpdate(payment.registration, {
        isPaid: true,
        amountDue: newAmountDue,
        discountApplied: updatedDiscountApplied,
        status: 'confirmed',
        payment: payment._id,
        paymentId: payment._id,
      });
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

  async rejectPayment(id: string): Promise<Payment> {
    const payment = await this.paymentModel.findByIdAndUpdate(
      id,
      { status: 'rejected' },
      { new: true },
    );

    if (payment && payment.registration) {
      await this.registrationModel.findByIdAndUpdate(payment.registration, {
        isPaid: false,
        paymentId: null,
      });

      // Notify user about rejection (in-app always, email when available).
      try {
        // Get populated payment data for email/notification
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

          if (userId && tripName) {
            try {
              await this.notificationService.createForUser(userId, {
                title: 'Payment rejected',
                message: `Your payment for ${tripName} was rejected. Please resubmit your payment to confirm your seat.`,
                type: 'payment',
                link: reg?._id
                  ? `/musafir/payment/${String(reg._id)}`
                  : '/passport',
                metadata: {
                  paymentId: payment._id?.toString(),
                  registrationId: reg?._id?.toString(),
                  flagshipId,
                  amount: payment.amount,
                },
              });
            } catch (error) {
              console.log('Failed to create payment rejected notification:', error);
            }
          }

          if (user && typeof user.email === 'string' && user.email && tripName) {
            try {
              await this.mailService.sendPaymentRejectedEmail(
                user.email,
                user.fullName || 'Musafir',
                payment.amount,
                tripName,
                // Note: We could add a reason parameter to the rejectPayment method if needed, unclear right now
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
        // Don't throw error - notification/email failure shouldn't prevent payment rejection
      }
    }

    return payment;
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

  async rejectRefund(id: string, admin?: User): Promise<Refund> {
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

    const refund = await this.refundModel.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { status: 'rejected' },
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
        .exec();

      // If refund was rejected, keep seat cancelled (do not restore confirmed seat).
      if (registration?.status === 'refundProcessing') {
        await this.registrationModel.findByIdAndUpdate(registration._id, {
          status: 'cancelled',
        });
      }

      if ((registration as any)?.userId) {
        await this.updateUserTripStats(String((registration as any).userId));

        const retryAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        try {
          await this.notificationService.createForUser(String((registration as any).userId), {
            title: 'Refund rejected',
            message:
              'Your refund request was rejected. You can reapply after 24 hours.',
            type: 'refund',
            link: '/passport',
            metadata: {
              refundId: refund._id?.toString(),
              registrationId: registration._id?.toString(),
              retryAt,
              rejectedBy: admin?._id?.toString(),
            },
          });
        } catch (error) {
          console.log('Failed to send refund rejected notification:', error);
        }
      }
    }

    return refund;
  }
}
