import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankAccount, Payment } from './interface/payment.interface';
import {
  CreateBankAccountDto,
  CreatePaymentDto,
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

  async getBankAccounts(): Promise<BankAccount[]> {
    return this.bankAccountModel.find();
  }

  async getRefunds(): Promise<Refund[]> {
    return this.refundModel
      .find()
      .populate({
        path: 'registration',
        populate: [
          { path: 'user' },
          { path: 'flagship' },
          { path: 'paymentId' },
        ],
      })
      .exec();
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
      .lean()
      .exec();
    if (!registration) {
      throw new BadRequestException({
        message: 'Registration not found.',
        code: 'refund_registration_not_found',
      });
    }

    const registrationUserId = (registration as any).userId || (registration as any).user;
    if (!registrationUserId || String(registrationUserId) !== String(requester._id)) {
      throw new ForbiddenException('You can only request a refund for your own registration.');
    }

    const status = String((registration as any)?.status || '');
    const amountDue =
      typeof (registration as any)?.amountDue === 'number'
        ? (registration as any).amountDue
        : typeof (registration as any)?.price === 'number'
          ? (registration as any).price
          : undefined;

    const eligibleStatus = status === 'confirmed' || status === 'accepted';
    if (!eligibleStatus || typeof amountDue !== 'number' || amountDue > 0) {
      throw new BadRequestException({
        message: 'Refunds can only be requested after your payment is approved and your seat is confirmed.',
        code: 'refund_not_eligible',
      });
    }

    const approvedPayment = await this.paymentModel
      .findOne({
        registration: (registration as any)._id,
        status: 'approved',
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    if (!approvedPayment) {
      throw new BadRequestException({
        message: 'Refunds can only be requested after your payment is approved.',
        code: 'refund_payment_not_approved',
      });
    }

    const existing = await this.refundModel.exists({
      registration: (registration as any)._id,
      status: { $in: ['pending', 'cleared'] },
    });
    if (existing) {
      throw new BadRequestException({
        message: 'A refund request already exists for this registration.',
        code: 'refund_already_requested',
      });
    }

    const updatedRegistration = await this.registrationModel.findOneAndUpdate(
      {
        _id: (registration as any)._id,
        userId: registrationUserId,
        status: (registration as any).status,
      },
      { $set: { status: 'refundProcessing' } },
      { new: true },
    );
    if (!updatedRegistration) {
      throw new BadRequestException({
        message: 'Refund could not be requested. Please retry.',
        code: 'refund_state_changed',
      });
    }

    const refund = new this.refundModel(requestRefundDto);
    return refund.save();
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
    screenshot: Express.Multer.File,
    requester?: User,
  ): Promise<Payment> {
    // Get registration to find user ID
    const registration = await this.registrationModel.findById(createPaymentDto.registration);
    if (!registration) {
      throw new Error('Registration not found');
    }

    const amountDue =
      typeof (registration as any)?.amountDue === 'number'
        ? (registration as any).amountDue
        : typeof (registration as any)?.price === 'number'
          ? (registration as any).price
          : undefined;
    if (typeof amountDue === 'number' && amountDue <= 0) {
      throw new BadRequestException({
        message: 'No payment is due for this registration.',
        code: 'no_payment_due',
      });
    }

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

    const registrationUserId = (registration as any).userId || (registration as any).user;

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

    // Use the discount provided in the DTO (0 if no discount applied)
    const discount = createPaymentDto.discount || 0;

    // Create payment with discount
    const paymentData = {
      ...createPaymentDto,
      discount: discount
    };

    const payment = new this.paymentModel(paymentData);
    const savedPayment = await payment.save();

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
        const paymentUrl =
          process.env.FRONTEND_URL && registrationId
            ? `${process.env.FRONTEND_URL}/musafir/payment/${registrationId}`
            : undefined;

        if (user && user.email && flagship) {
          await this.mailService.sendPaymentApprovedEmail(
            user.email,
            user.fullName || 'Musafir',
            payment.amount,
            flagship.tripName,
            payment.createdAt,
            {
              remainingDue: typeof remainingDue === 'number' ? remainingDue : undefined,
              paymentUrl,
            },
          );
          // Also send an in-app notification
          await this.notificationService.createForUser(String(user._id), {
            title: 'Payment approved',
            message:
              typeof remainingDue === 'number' && remainingDue > 0
                ? `Your payment for ${flagship.tripName} was approved. Remaining due: Rs.${remainingDue.toLocaleString()}.`
                : `Your payment for ${flagship.tripName} was approved. Your seat is confirmed.`,
            type: 'payment',
            link:
              typeof remainingDue === 'number' && remainingDue > 0 && registrationId
                ? `/musafir/payment/${registrationId}`
                : '/passport',
            metadata: {
              paymentId: payment._id?.toString(),
              registrationId: reg._id?.toString(),
              flagshipId: flagship._id?.toString(),
              amount: payment.amount,
              remainingDue: typeof remainingDue === 'number' ? remainingDue : undefined,
            },
          });
        }
      }
    } catch (error) {
      console.log('Failed to send payment approved email:', error);
      // Don't throw error - email failure shouldn't prevent payment approval
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

      // Send payment rejected email if user has an email
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

          if (user && user.email && flagship) {
            await this.mailService.sendPaymentRejectedEmail(
              user.email,
              user.fullName || 'Musafir',
              payment.amount,
              flagship.tripName
              // Note: We could add a reason parameter to the rejectPayment method if needed, unclear right now 
            );
          }
        }
      } catch (error) {
        console.log('Failed to send payment rejected email:', error);
        // Don't throw error - email failure shouldn't prevent payment rejection
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

  async approveRefund(id: string): Promise<Refund> {
    const refund = await this.refundModel.findByIdAndUpdate(
      id,
      { status: 'cleared' },
      { new: true },
    );

    if (refund?.registration) {
      const registration = await this.registrationModel
        .findById(refund.registration)
        .exec();

      if (registration) {
        await this.registrationModel.findByIdAndUpdate(registration._id, {
          status: 'refunded',
        });

        await this.updateUserTripStats(String(registration.userId));
      }
    }

    return refund;
  }

  async rejectRefund(id: string): Promise<Refund> {
    const refund = await this.refundModel.findByIdAndUpdate(
      id,
      { status: 'rejected' },
      { new: true },
    );

    if (refund?.registration) {
      const registration = await this.registrationModel
        .findById(refund.registration)
        .exec();

      // If refund was rejected, bring the registration back from refundProcessing to confirmed.
      if (registration?.status === 'refundProcessing') {
        await this.registrationModel.findByIdAndUpdate(registration._id, {
          status: 'confirmed',
        });
      }

      if (registration?.userId) {
        await this.updateUserTripStats(String(registration.userId));
      }
    }

    return refund;
  }
}
