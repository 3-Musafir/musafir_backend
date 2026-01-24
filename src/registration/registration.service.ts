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
import { Payment } from 'src/payment/interface/payment.interface';
import { MailService } from 'src/mail/mail.service';
import mongoose from 'mongoose';
import { StorageService } from 'src/storage/storageService';
import { NotificationService } from 'src/notifications/notification.service';
import { REFUND_POLICY_LINK } from 'src/payment/refund-policy.util';
import { resolveSeatBucket, getSeatCounterUpdate, getRemainingSeatsForBucket } from 'src/flagship/seat-utils';
import { VerificationStatus } from 'src/constants/verification-status.enum';

@Injectable()
export class RegistrationService {
  constructor(
    @InjectModel('Registration') private readonly registrationModel: Model<Registration>,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Payment') private readonly paymentModel: Model<Payment>,
    @InjectModel('Flagship') private readonly flagshipModel: Model<any>,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
  ) { }

  private async syncCompletedRegistrationsForUser(userId: string): Promise<void> {
    const now = new Date();

    // Mark confirmed registrations as completed once the trip has ended.
    const confirmedRegs = await this.registrationModel
      .find({ userId, status: 'confirmed', seatLocked: true, completedAt: { $exists: false } })
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
        { $set: { completedAt: now } },
      );
    }
  }


  private async adjustFlagshipSeatCount(
    flagshipId: string,
    bucket: 'male' | 'female',
    kind: 'confirmed' | 'waitlisted',
    delta: number,
  ) {
    if (!flagshipId || !delta) return;
    await this.flagshipModel.findByIdAndUpdate(
      flagshipId,
      { $inc: getSeatCounterUpdate(bucket, kind, delta) },
    );
  }

  private async expireWaitlistOffers(flagshipId: string) {
    const now = new Date();
    await this.registrationModel.updateMany(
      {
        flagship: flagshipId,
        status: 'waitlisted',
        waitlistOfferStatus: 'offered',
        waitlistOfferExpiresAt: { $lte: now },
      },
      {
        $set: {
          waitlistOfferStatus: 'expired',
          waitlistOfferResponse: 'declined',
          waitlistAt: now,
          waitlistOfferSentAt: null,
          waitlistOfferAcceptedAt: null,
          waitlistOfferExpiresAt: null,
        },
      },
    );
  }

  private async expireWaitlistAcceptances(flagshipId: string) {
    const now = new Date();
    const candidates: any[] = await this.registrationModel
      .find({
        flagship: flagshipId,
        status: { $in: ['payment', 'onboarding'] },
        waitlistOfferStatus: 'accepted',
        waitlistOfferExpiresAt: { $lte: now },
      })
      .select('_id userGender userId user status')
      .lean()
      .exec();

    if (!candidates || candidates.length === 0) return;

    const registrationIds = candidates.map((c) => c._id);
    const pendingPaymentRegs = await this.paymentModel.distinct('registration', {
      registration: { $in: registrationIds },
      status: 'pendingApproval',
    });
    const pendingSet = new Set((pendingPaymentRegs || []).map((id: any) => String(id)));

    const userIds = Array.from(
      new Set(
        candidates
          .map((c) => c.userId || c.user)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    );
    const users = userIds.length
      ? await this.userModel
        .find({ _id: { $in: userIds } })
        .select('_id verification gender')
        .lean()
        .exec()
      : [];
    const userById = new Map(users.map((u: any) => [String(u._id), u]));

    const expiredIds: any[] = [];
    let maleExpired = 0;
    let femaleExpired = 0;

    for (const candidate of candidates) {
      const regId = String(candidate._id);
      if (candidate.status === 'payment' && pendingSet.has(regId)) {
        continue;
      }

      if (candidate.status === 'onboarding') {
        const user = userById.get(String(candidate.userId || candidate.user));
        const verificationStatus = (user as any)?.verification?.status;
        if (verificationStatus === VerificationStatus.PENDING) {
          continue;
        }
      }

      expiredIds.push(candidate._id);
      const bucket = resolveSeatBucket(
        candidate.userGender || userById.get(String(candidate.userId || candidate.user))?.gender,
      );
      if (bucket === 'female') femaleExpired += 1;
      else maleExpired += 1;
    }

    if (expiredIds.length === 0) return;

    await this.registrationModel.updateMany(
      { _id: { $in: expiredIds } },
      {
        $set: {
          status: 'waitlisted',
          waitlistAt: now,
          waitlistOfferStatus: 'expired',
          waitlistOfferResponse: 'declined',
          waitlistOfferSentAt: null,
          waitlistOfferAcceptedAt: null,
          waitlistOfferExpiresAt: null,
          paymentId: null,
          payment: null,
        },
      },
    );

    const inc: any = {};
    if (femaleExpired > 0) {
      inc.waitlistedFemaleCount = femaleExpired;
    }
    if (maleExpired > 0) {
      inc.waitlistedMaleCount = maleExpired;
    }
    if (Object.keys(inc).length > 0) {
      await this.flagshipModel.findByIdAndUpdate(flagshipId, { $inc: inc });
    }
  }

  private async promoteWaitlistForFlagship(flagshipId: string) {
    if (!flagshipId) return;

    const flagship = await this.flagshipModel.findById(flagshipId).lean();
    if (!flagship) return;

    await this.expireWaitlistOffers(flagshipId);
    await this.expireWaitlistAcceptances(flagshipId);

    const now = new Date();
    const offerWindowMs = 4 * 60 * 60 * 1000;

    const activeOfferMale = await this.registrationModel.countDocuments({
      flagship: flagshipId,
      status: 'waitlisted',
      waitlistOfferStatus: 'offered',
      userGender: { $ne: 'female' },
      waitlistOfferExpiresAt: { $gt: now },
    });
    const activeOfferFemale = await this.registrationModel.countDocuments({
      flagship: flagshipId,
      status: 'waitlisted',
      waitlistOfferStatus: 'offered',
      userGender: 'female',
      waitlistOfferExpiresAt: { $gt: now },
    });

    let remainingMale =
      getRemainingSeatsForBucket(flagship, 'male') - activeOfferMale;
    let remainingFemale =
      getRemainingSeatsForBucket(flagship, 'female') - activeOfferFemale;

    const sendOfferForBucket = async (bucket: 'male' | 'female') => {
      const query: any = {
        flagship: flagshipId,
        status: 'waitlisted',
        waitlistOfferStatus: { $ne: 'offered' },
      };
      if (bucket === 'female') {
        query.userGender = 'female';
      } else {
        query.userGender = { $ne: 'female' };
      }

      const offerExpiresAt = new Date(Date.now() + offerWindowMs);
      const candidate = await this.registrationModel.findOneAndUpdate(
        query,
        {
          $set: {
            waitlistOfferStatus: 'offered',
            waitlistOfferSentAt: now,
            waitlistOfferAcceptedAt: null,
            waitlistOfferExpiresAt: offerExpiresAt,
            waitlistOfferResponse: null,
          },
        },
        { sort: { waitlistAt: 1, createdAt: 1 }, new: true },
      );

      if (!candidate) return false;

      try {
        const userId = candidate.userId?.toString?.() || candidate.user?.toString?.();
        if (userId) {
          await this.notificationService.createForUser(userId, {
            title: 'Seat available - confirm interest',
            message: 'A seat just opened up. Are you still interested in joining? You have 4 hours to respond.',
            type: 'waitlist',
            link: `/waitlist/offer/${candidate._id}`,
            metadata: {
              registrationId: candidate._id?.toString?.(),
              flagshipId: String(flagshipId),
              offerExpiresAt: offerExpiresAt.toISOString(),
            },
          });
        }
      } catch (error) {
        console.log('Failed to notify waitlisted user:', error);
      }

      return true;
    };

    while (remainingMale > 0) {
      const offered = await sendOfferForBucket('male');
      if (!offered) break;
      remainingMale -= 1;
    }

    while (remainingFemale > 0) {
      const offered = await sendOfferForBucket('female');
      if (!offered) break;
      remainingFemale -= 1;
    }
  }

  async processWaitlistForFlagship(flagshipId: string) {
    await this.promoteWaitlistForFlagship(flagshipId);
    return { flagshipId };
  }

  async respondWaitlistOffer(
    registrationId: string,
    user: User,
    response: 'accepted' | 'declined',
  ) {
    const userId = user?._id?.toString();
    if (!userId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'waitlist_auth_required',
      });
    }

    const now = new Date();
    const acceptWindowMs = 4 * 60 * 60 * 1000;
    const registration: any = await this.registrationModel
      .findById(registrationId)
      .lean()
      .exec();
    if (!registration) {
      throw new NotFoundException('Registration not found.');
    }

    const registrationUserId = registration.userId || registration.user;
    if (!registrationUserId || String(registrationUserId) !== String(userId)) {
      throw new ForbiddenException('You can only respond to your own waitlist offer.');
    }

    if (String(registration.status || '') !== 'waitlisted') {
      throw new BadRequestException({
        message: 'This registration is no longer on the waitlist.',
        code: 'waitlist_not_active',
      });
    }

    if (registration.waitlistOfferStatus !== 'offered') {
      throw new BadRequestException({
        message: 'There is no active waitlist offer for this registration.',
        code: 'waitlist_offer_missing',
      });
    }

    if (registration.waitlistOfferExpiresAt && new Date(registration.waitlistOfferExpiresAt) <= now) {
      await this.registrationModel.findByIdAndUpdate(registration._id, {
        $set: {
          waitlistOfferStatus: 'expired',
          waitlistOfferResponse: 'declined',
          waitlistAt: now,
          waitlistOfferSentAt: null,
          waitlistOfferAcceptedAt: null,
          waitlistOfferExpiresAt: null,
        },
      });

      await this.promoteWaitlistForFlagship(String(registration.flagship || registration.flagshipId));

      throw new BadRequestException({
        message: 'This waitlist offer has expired.',
        code: 'waitlist_offer_expired',
      });
    }

    const flagshipId = String(registration.flagship || registration.flagshipId || '');

    if (response === 'declined') {
      const updated = await this.registrationModel.findOneAndUpdate(
        {
          _id: registration._id,
          status: 'waitlisted',
          waitlistOfferStatus: 'offered',
          waitlistOfferExpiresAt: { $gt: now },
        },
        {
          $set: {
            waitlistOfferStatus: 'expired',
            waitlistOfferResponse: 'declined',
            waitlistAt: now,
            waitlistOfferSentAt: null,
            waitlistOfferAcceptedAt: null,
            waitlistOfferExpiresAt: null,
          },
        },
        { new: true },
      );

      if (!updated) {
        throw new BadRequestException({
          message: 'Waitlist offer could not be declined. Please retry.',
          code: 'waitlist_offer_state_changed',
        });
      }

      await this.promoteWaitlistForFlagship(flagshipId);
      return updated;
    }

    const flagship = await this.flagshipModel.findById(flagshipId).lean();
    if (!flagship) {
      throw new NotFoundException('Flagship not found.');
    }

    const userDoc = await this.userModel.findById(userId).select('verification gender').lean();
    const bucket = resolveSeatBucket(
      registration.userGender || (userDoc as any)?.gender || user?.gender,
    );
    const remainingSeats = getRemainingSeatsForBucket(flagship, bucket);
    if (remainingSeats <= 0) {
      await this.registrationModel.findByIdAndUpdate(registration._id, {
        $set: {
          waitlistOfferStatus: 'expired',
          waitlistOfferResponse: 'declined',
          waitlistAt: now,
          waitlistOfferSentAt: null,
          waitlistOfferAcceptedAt: null,
          waitlistOfferExpiresAt: null,
        },
      });

      throw new BadRequestException({
        message: 'Seats filled before you responded. You remain on the waitlist.',
        code: 'waitlist_seats_full',
      });
    }

    const isVerified =
      (userDoc as any)?.verification?.status === VerificationStatus.VERIFIED;
    const nextStatus = isVerified ? 'payment' : 'onboarding';

    const acceptExpiresAt = new Date(Date.now() + acceptWindowMs);
    const updated = await this.registrationModel.findOneAndUpdate(
      {
        _id: registration._id,
        status: 'waitlisted',
        waitlistOfferStatus: 'offered',
        waitlistOfferExpiresAt: { $gt: now },
      },
      {
        $set: {
          status: nextStatus,
          waitlistOfferStatus: 'accepted',
          waitlistOfferResponse: 'accepted',
          waitlistOfferSentAt: registration.waitlistOfferSentAt || now,
          waitlistOfferAcceptedAt: now,
          waitlistOfferExpiresAt: acceptExpiresAt,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new BadRequestException({
        message: 'Waitlist offer could not be accepted. Please retry.',
        code: 'waitlist_offer_state_changed',
      });
    }

    await this.adjustFlagshipSeatCount(flagshipId, bucket, 'waitlisted', -1);
    return updated;
  }
  private async updateUserTripStats(userId: string): Promise<void> {
    const attendedCount = await this.registrationModel.countDocuments({
      userId,
      completedAt: { $exists: true },
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

      const existing = await this.registrationModel
        .findOne({
          userId,
          flagship: registration.flagshipId,
          cancelledAt: { $exists: false },
          refundStatus: { $ne: 'refunded' },
        })
        .select('_id isPaid status amountDue')
        .lean()
        .exec();

      if (existing) {
        return {
          registrationId: String(existing._id),
          message: 'You already have a registration for this flagship.',
          alreadyRegistered: true,
          isPaid: Boolean(existing.isPaid),
          status: existing.status,
          amountDue: existing.amountDue ?? 0,
        };
      }

      const existing = await this.registrationModel.findOne({
        userId,
        flagship: registration.flagshipId,
        cancelledAt: { $exists: false },
        refundStatus: { $ne: 'refunded' },
      }).select('_id').lean().exec();

      if (existing) {
        return {
          registrationId: String(existing._id),
          message: 'You already have a registration for this flagship.',
        };
      }

      const initialStatus =
        user?.verification?.status === VerificationStatus.VERIFIED
          ? 'payment'
          : 'onboarding';

      const newRegistration = new this.registrationModel({
        ...registration,
        amountDue: registration.price,
        status: initialStatus,
        userGender: user?.gender,
        waitlistOfferStatus: 'none',
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
        userId: userId,
        $or: [
          { completedAt: { $exists: true } },
          { refundStatus: 'refunded' },
        ],
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
        userId: userId,
        $and: [
          { completedAt: { $exists: false } },
          { refundStatus: { $ne: 'refunded' } },
        ],
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
      { _id: registration._id, userId: registrationUserId, status: 'confirmed', cancelledAt: { $exists: false } },
      { $set: { cancelledAt: new Date(), seatLocked: false } },
      { new: true },
    );

    if (!updated) {
      throw new BadRequestException({
        message: 'Seat could not be cancelled. Please retry.',
        code: 'cancel_state_changed',
      });
    }

    if (registration.seatLocked) {
      const flagshipId = String(registration.flagship || registration.flagshipId || '');
      if (flagshipId) {
        const bucket = resolveSeatBucket(registration.userGender || user?.gender);
        await this.adjustFlagshipSeatCount(flagshipId, bucket, 'confirmed', -1);
        await this.promoteWaitlistForFlagship(flagshipId);
      }
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

  async deleteRegistrationAsAdmin(registrationId: string, reason?: string) {
    if (!registrationId) {
      throw new BadRequestException({
        message: 'Registration ID is required.',
        code: 'registration_id_required',
      });
    }

    const cleanReason = typeof reason === 'string' ? reason.trim() : undefined;

    const registration = await this.registrationModel
      .findById(registrationId)
      .populate('flagship')
      .populate('user')
      .lean()
      .exec();

    if (!registration) {
      throw new NotFoundException('Registration not found.');
    }

    const registrationUserId = registration.userId || registration.user;
    const user = registration.user as any;
    const userEmail = user?.email;
    const userFullName = user?.fullName || 'Musafir';
    const flagshipDoc = registration.flagship || registration.flagshipId;
    const flagshipId = flagshipDoc ? String((flagshipDoc as any)._id || flagshipDoc) : null;
    const tripName =
      (flagshipDoc && (flagshipDoc as any)?.tripName) || 'your trip';
    const seatLocked = Boolean(registration.seatLocked);
    const isWaitlisted = String(registration.status || '') === 'waitlisted';
    const bucket = resolveSeatBucket(
      registration.userGender || user?.gender,
    );
    const paymentId = registration.paymentId || registration.payment;

    if (paymentId) {
      await this.paymentModel.findByIdAndDelete(paymentId);
    }

    await this.registrationModel.findByIdAndDelete(registrationId);

    if (seatLocked && flagshipId) {
      await this.flagshipModel.findByIdAndUpdate(
        flagshipId,
        { $inc: getSeatCounterUpdate(bucket, 'confirmed', -1) },
      );
    }

    if (isWaitlisted && flagshipId) {
      await this.flagshipModel.findByIdAndUpdate(
        flagshipId,
        { $inc: getSeatCounterUpdate(bucket, 'waitlisted', -1) },
      );
    }

    if (seatLocked && flagshipId) {
      try {
        await this.promoteWaitlistForFlagship(flagshipId);
      } catch (error) {
        console.error(
          'Failed to promote waitlist after admin deleted registration:',
          error,
        );
      }
    }

    if (registrationUserId) {
      const notificationMessage = cleanReason
        ? `Your seat for ${tripName} was removed by admin. Reason: ${cleanReason}. Please re-register when you are ready.`
        : `Your seat for ${tripName} was removed by admin. Please re-register when you are ready.`;
      try {
        const registrationLink = flagshipId
          ? `/flagship/flagship-requirement?id=${flagshipId}&fromDetailsPage=true`
          : undefined;

        await this.notificationService.createForUser(String(registrationUserId), {
          title: 'Registration removed',
          message: notificationMessage,
          type: 'general',
          link: registrationLink,
          metadata: {
            registrationId,
            reason: cleanReason,
          },
        });
      } catch (err) {
        console.error('Failed to notify user about registration deletion:', err);
      }
    }

    if (userEmail) {
      const tripLink =
        flagshipId && process.env.FRONTEND_URL
          ? `${process.env.FRONTEND_URL}/flagship/flagship-requirement?id=${flagshipId}`
          : undefined;

      try {
        await this.mailService.sendMail(
          userEmail,
          'Your 3Musafir registration was removed',
          './registration-deleted',
          {
            fullName: userFullName,
            tripName,
            tripLink,
            reason: cleanReason,
          },
        );
      } catch (error) {
        console.error('Failed to send registration deletion email:', error);
      }
    }

    return { registrationId, reason: cleanReason };
  }
}
