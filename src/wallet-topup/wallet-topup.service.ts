import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailService } from 'src/mail/mail.service';
import { NotificationService } from 'src/notifications/notification.service';
import { User } from 'src/user/interfaces/user.interface';
import { WalletService } from 'src/wallet/wallet.service';
import { WALLET_TOPUP_WHATSAPP_NUMBER } from 'src/wallet/wallet.constants';
import { TopupRequest } from './interfaces/topup.interface';

@Injectable()
export class WalletTopupService {
  constructor(
    @InjectModel('TopupRequest')
    private readonly topupRequestModel: Model<TopupRequest>,
    @InjectModel('User')
    private readonly userModel: Model<User>,
    private readonly walletService: WalletService,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
  ) {}

  async createTopupRequest(user: User, packageAmount: number) {
    const userId = user?._id?.toString();
    if (!userId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'topup_auth_required',
      });
    }

    const email = user.email || '';
    const messageTemplate = `Wallet top-up request: ${packageAmount} PKR\\nEmail: ${email}\\nUserId: ${userId}`;

    const request = await this.topupRequestModel.create({
      userId,
      packageAmount,
      status: 'pending',
      whatsappTo: WALLET_TOPUP_WHATSAPP_NUMBER,
      messageTemplate,
    });

    const whatsappUrl = `https://wa.me/${WALLET_TOPUP_WHATSAPP_NUMBER.replace(
      /\\D/g,
      '',
    )}?text=${encodeURIComponent(messageTemplate)}`;

    return {
      request,
      whatsapp: {
        to: WALLET_TOPUP_WHATSAPP_NUMBER,
        message: messageTemplate,
        url: whatsappUrl,
      },
    };
  }

  async adminListTopups(status?: 'pending' | 'processed' | 'rejected') {
    const filter: any = {};
    if (status) filter.status = status;
    return this.topupRequestModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate({ path: 'userId', select: 'fullName email phone referralID' })
      .populate({ path: 'processedBy', select: 'fullName email' })
      .lean()
      .exec();
  }

  async adminListTopupsPaginated(options?: {
    status?: 'pending' | 'processed' | 'rejected';
    page?: number;
    limit?: number;
  }) {
    const status = options?.status;
    const pageRaw = Number(options?.page);
    const limitRaw = Number(options?.limit);
    const shouldPaginate =
      (Number.isFinite(pageRaw) && pageRaw > 0) ||
      (Number.isFinite(limitRaw) && limitRaw > 0);

    const filter: any = {};
    if (status) filter.status = status;

    if (!shouldPaginate) {
      // Backward compatible: old shape (array) when page/limit not provided.
      return this.adminListTopups(status);
    }

    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1);
    const skip = (page - 1) * limit;

    const [total, topups] = await Promise.all([
      this.topupRequestModel.countDocuments(filter).exec(),
      this.topupRequestModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'userId', select: 'fullName email phone referralID' })
        .populate({ path: 'processedBy', select: 'fullName email' })
        .lean()
        .exec(),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { topups, page, limit, total, totalPages };
  }

  async markCredited(id: string, admin: User) {
    const adminId = admin?._id?.toString();
    if (!adminId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'topup_admin_auth_required',
      });
    }

    const request: any = await this.topupRequestModel.findById(id).exec();
    if (!request) {
      throw new BadRequestException({
        message: 'Top-up request not found.',
        code: 'topup_not_found',
      });
    }

    if (request.status === 'processed') return request.toObject();

    // Credit wallet (idempotent by sourceId=topupRequestId).
    await this.walletService.credit({
      userId: String(request.userId),
      amount: Number(request.packageAmount),
      type: 'topup_credit',
      sourceId: String(request._id),
      sourceType: 'topup_request',
      postedBy: adminId,
      metadata: {
        sourceId: String(request._id),
        packageAmount: Number(request.packageAmount),
      },
    });

    request.status = 'processed';
    request.processedAt = new Date();
    request.processedBy = adminId;
    await request.save();

    // Notify user
    try {
      const userDoc: any = await this.userModel
        .findById(request.userId)
        .select('email fullName')
        .lean()
        .exec();

      await this.notificationService.createForUser(String(request.userId), {
        title: 'Wallet top-up credited',
        message: `Rs.${Number(request.packageAmount).toLocaleString()} has been added to your wallet.`,
        type: 'wallet',
        link: '/wallet',
        metadata: { topupRequestId: String(request._id), amount: Number(request.packageAmount) },
      });

      if (userDoc?.email) {
        await this.mailService.sendMail(
          userDoc.email,
          'Your 3Musafir wallet top-up is credited',
          './wallet-topup-credited',
          {
            fullName: userDoc.fullName || 'Musafir',
            amount: Number(request.packageAmount),
          },
        );
      }
    } catch (e) {
      console.log('Failed to send top-up credited comms:', e);
    }

    return request.toObject();
  }

  async rejectTopup(id: string, admin: User, reason?: string) {
    const adminId = admin?._id?.toString();
    if (!adminId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'topup_admin_auth_required',
      });
    }

    const request: any = await this.topupRequestModel.findById(id).exec();
    if (!request) {
      throw new BadRequestException({
        message: 'Top-up request not found.',
        code: 'topup_not_found',
      });
    }

    if (request.status === 'processed') {
      throw new BadRequestException({
        message: 'Top-up already processed.',
        code: 'topup_already_processed',
      });
    }

    request.status = 'rejected';
    request.processedAt = new Date();
    request.processedBy = adminId;
    await request.save();

    try {
      await this.notificationService.createForUser(String(request.userId), {
        title: 'Wallet top-up rejected',
        message: reason
          ? `Your top-up request was rejected: ${reason}`
          : 'Your top-up request was rejected.',
        type: 'wallet',
        link: '/wallet',
        metadata: { topupRequestId: String(request._id) },
      });
    } catch (e) {
      console.log('Failed to send top-up rejected notification:', e);
    }

    return request.toObject();
  }
}
