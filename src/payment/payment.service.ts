import { Injectable } from '@nestjs/common';
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
  ) { }

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

  async requestRefund(requestRefundDto: RequestRefundDto): Promise<Refund> {
    const refund = new this.refundModel(requestRefundDto);

    const registration = await this.registrationModel.findById(
      requestRefundDto.registration,
    );
    if (registration) {
      registration.status = 'refundProcessing';
      await registration.save();
    }
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
  ): Promise<Payment> {
    // Get registration to find user ID
    const registration = await this.registrationModel.findById(createPaymentDto.registration);
    if (!registration) {
      throw new Error('Registration not found');
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
    const payment = await this.paymentModel.findByIdAndUpdate(
      id,
      { status: 'approved' },
      { new: true },
    );

    if (payment && payment.registration) {
      const registration = await this.registrationModel.findById(
        payment.registration,
      );

      await this.registrationModel.findByIdAndUpdate(payment.registration, {
        isPaid: true,
        amountDue: registration.amountDue - payment.amount,
        status: 'confirmed',
      });

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

          if (user && user.email && flagship) {
            await this.mailService.sendPaymentApprovedEmail(
              user.email,
              user.fullName || 'Musafir',
              payment.amount,
              flagship.tripName,
              payment.createdAt
            );
          }
        }
      } catch (error) {
        console.log('Failed to send payment approved email:', error);
        // Don't throw error - email failure shouldn't prevent payment approval
      }
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
