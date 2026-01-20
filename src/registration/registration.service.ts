import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { Registration } from './interfaces/registration.interface';
import { User } from 'src/user/interfaces/user.interface';
import { MailService } from 'src/mail/mail.service';
import mongoose from 'mongoose';
import { StorageService } from 'src/storage/storageService';
import { NotificationService } from 'src/notifications/notification.service';
import { REFUND_POLICY_LINK } from 'src/payment/refund-policy.util';

@Injectable()
export class RegistrationService {
  constructor(
    @InjectModel('Registration') private readonly registrationModel: Model<Registration>,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Flagship') private readonly flagshipModel: Model<any>,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
  ) { }

  private async syncCompletedRegistrationsForUser(userId: string): Promise<void> {
    const now = new Date();

    // Registrations are marked "confirmed" when payment is approved.
    // Once the trip has ended, we treat them as "completed".
    const confirmedRegs = await this.registrationModel
      .find({ userId, status: 'confirmed' })
      .populate('flagship')
      .exec();

    const toCompleteIds = confirmedRegs
      .filter((r: any) => {
        const endDate = r?.flagship?.endDate;
        return endDate && new Date(endDate) < now;
      })
      .map((r) => r._id);

    if (toCompleteIds.length > 0) {
      await this.registrationModel.updateMany(
        { _id: { $in: toCompleteIds } },
        { $set: { status: 'completed' } },
      );
    }
  }

  private async updateUserTripStats(userId: string): Promise<void> {
    const attendedCount = await this.registrationModel.countDocuments({
      userId,
      status: 'completed',
    });

    await this.userModel.findByIdAndUpdate(userId, {
      numberOfFlagshipsAttended: attendedCount,
      discountApplicable: attendedCount * 500,
    });
  }

  async createRegistration(registration: CreateRegistrationDto, userId: string): Promise<{ registrationId: string, message: string }> {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      const flagship = await this.flagshipModel.findById(registration.flagshipId);
      if (!flagship) {
        throw new NotFoundException(`Flagship with ID ${registration.flagshipId} not found`);
      }

      const newRegistration = new this.registrationModel({
        ...registration,
        amountDue: registration.price,
        userId: userId,
        user: user,
        flagship: new mongoose.Types.ObjectId(registration.flagshipId)
      });

      const createdRegistration = await newRegistration.save();

      
      try {
        const populatedRegistration = await this.registrationModel
          .findById(createdRegistration._id)
          .populate('user')
          .populate('flagship')
          .exec();

        const reg: any = populatedRegistration;
        const regUser = reg?.user;
        const regFlagship = reg?.flagship;

        await this.mailService.sendAdminRegistrationNotification({
          registrationId: String(createdRegistration._id),
          flagshipId: String(registration.flagshipId),
          flagshipName: regFlagship?.tripName,
          userName: regUser?.fullName || 'Musafir',
          userEmail: regUser?.email,
          userPhone: regUser?.phone,
          userCity: regUser?.city,
          joiningFromCity: registration.joiningFromCity,
          tier: registration.tier,
          bedPreference: registration.bedPreference,
          roomSharing: registration.roomSharing,
          groupMembers: registration.groupMembers,
          expectations: registration.expectations,
          tripType: registration.tripType,
          price: registration.price,
          amountDue: registration.price,
          createdAt: createdRegistration.createdAt,
          startDate: regFlagship?.startDate,
          endDate: regFlagship?.endDate,
          destination: regFlagship?.destination,
          category: regFlagship?.category,
        });
      } catch (e) {
        console.log('Failed to send admin registration notification:', e);
      }

      return {
        registrationId: createdRegistration._id,
        message: "Registration created successfully."
      }
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  async getPastPassport(userId: string) {
    try {
      // Keep status + user stats in sync before returning passport data
      await this.syncCompletedRegistrationsForUser(userId);
      await this.updateUserTripStats(userId);

      return await this.registrationModel.find({
        status: { $in: ["completed", "refunded"] },
        userId: userId
      })
        .populate('flagshipId')
        .populate('ratingId')
        .exec();
    } catch (error) {
      throw new Error(`Failed to fetch past passport data: ${error.message}`);
    }
  }

  async getUpcomingPassport(userId: string) {
    try {
      // Keep status + user stats in sync before returning passport data
      await this.syncCompletedRegistrationsForUser(userId);
      await this.updateUserTripStats(userId);

      const now = new Date();
      const registrations = await this.registrationModel.find({
        status: { $nin: ["completed", "refunded"] },
        userId: userId
      })
        .populate({
          path: 'flagship',
          match: { endDate: { $gte: now } },
        })
        .populate({
          path: 'paymentId',
          select: 'status amount paymentType discount createdAt',
        })
        .exec();

      const upcomingOnly = registrations.filter((r: any) => r?.flagship);

      return await Promise.all(
        upcomingOnly.map(async (registration) => {
          const price = (registration as any)?.price;
          const amountDue = (registration as any)?.amountDue;
          const status = String((registration as any)?.status || '');
          const hasApprovedPayment =
            typeof price === 'number' &&
            typeof amountDue === 'number' &&
            amountDue < price;

          if (status === 'accepted') {
            (registration as any).status = hasApprovedPayment ? 'confirmed' : 'pending';
          } else if (status === 'notReserved' && hasApprovedPayment) {
            (registration as any).status = 'confirmed';
          }

          if (registration.flagship.images && registration.flagship.images.length > 0) {
            const imageUrls = await Promise.all(
              registration.flagship.images.map(async (imageKey) => {
                return await this.storageService.getSignedUrl(imageKey);
              }),
            );
            registration.flagship.images = imageUrls;
          }

          if (registration.flagship.detailedPlan) {
            registration.flagship.detailedPlan = await this.storageService.getSignedUrl(
              registration.flagship.detailedPlan,
            );
          }
          return registration;
        }));
    } catch (error) {
      throw new Error(`Failed to fetch upcoming passport data: ${error.message}`);
    }
  }

  async getRegistrationById(registrationId: string) {
    try {
      if (!registrationId) {
        throw new Error("Registration ID is required");
      }

      const registration = await this.registrationModel.findById(registrationId)
        .populate('flagship')
        .populate('user')
        .populate({
          path: 'paymentId',
          select: 'status amount paymentType discount createdAt',
        })
        .exec();

      if (registration.flagship.images.length > 0) {
        registration.flagship.images = await Promise.all(
          registration.flagship.images.map(async (imageKey) => {
            return await this.storageService.getSignedUrl(imageKey);
          })
        )
      }

      return registration;
    } catch (error) {
      throw new Error(`Failed to fetch registration data: ${error.message}`);
    }
  }

  async cancelSeat(registrationId: string, user: User) {
    const userId = user?._id?.toString();
    if (!userId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'cancel_auth_required',
      });
    }

    const registration: any = await this.registrationModel
      .findById(registrationId)
      .lean()
      .exec();
    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    const registrationUserId = registration.userId || registration.user;
    if (!registrationUserId || String(registrationUserId) !== String(userId)) {
      throw new ForbiddenException('You can only cancel your own seat.');
    }

    const status = String(registration.status || '');
    if (status !== 'confirmed') {
      throw new BadRequestException({
        message: 'Only confirmed seats can be cancelled.',
        code: 'cancel_not_eligible',
      });
    }

    const updated = await this.registrationModel.findOneAndUpdate(
      { _id: registration._id, userId: registrationUserId, status: 'confirmed' },
      { $set: { status: 'cancelled' } },
      { new: true },
    );

    if (!updated) {
      throw new BadRequestException({
        message: 'Seat could not be cancelled. Please retry.',
        code: 'cancel_state_changed',
      });
    }

    try {
      const flagshipId = registration.flagship || registration.flagshipId;
      const flagship = await this.flagshipModel
        .findById(flagshipId)
        .select('tripName')
        .lean()
        .exec();
      const tripName = Array.isArray(flagship)
        ? (flagship?.[0] as any)?.tripName || 'your trip'
        : (flagship as any)?.tripName || 'your trip';

      await this.notificationService.createForUser(userId, {
        title: 'Seat cancelled',
        message: `Your seat for ${tripName} has been cancelled. You can request a refund based on the refund policy.`,
        type: 'refund',
        link: `/musafir/refund/${registrationId}`,
        metadata: { registrationId: String(registrationId), policyLink: REFUND_POLICY_LINK },
      });

      if ((user as any)?.email) {
        await this.mailService.sendMail(
          (user as any).email,
          'Your 3Musafir seat has been cancelled',
          './seat-cancelled',
          {
            fullName: (user as any).fullName || 'Musafir',
            tripName,
            refundPolicyLink: REFUND_POLICY_LINK,
            refundUrl:
              process.env.FRONTEND_URL && registrationId
                ? `${process.env.FRONTEND_URL}/musafir/refund/${registrationId}`
                : undefined,
          },
        );
      }
    } catch (e) {
      console.log('Failed to send cancellation comms:', e);
    }

    return updated;
  }



  async sendReEvaluateRequestToJury(registrationId: string, user: User) {
    try {
      const registration = await this.getRegistrationById(registrationId);
      const tripName = typeof registration.flagshipId === 'object' ? registration.flagshipId.tripName : '';
      await this.mailService.sendReEvaluateRequestToJury(registrationId, tripName, user.fullName, user.email, user.phone, user?.city);
      return "Re-evaluate request sent to jury successfully.";

    } catch (error) {
      throw new Error(`Failed to send the re-evalute request to jury: ${error.message}`);
    }
  }
} 
