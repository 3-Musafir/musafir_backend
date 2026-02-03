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
import { getGroupDiscountPerMember, reallocateGroupDiscountsForFlagship } from './group-discount.util';

const isGroupedTripType = (tripType?: string) =>
  tripType === 'group' || tripType === 'partner';

export interface CreateRegistrationResult {
  registrationId: string;
  message: string;
  alreadyRegistered?: boolean;
  isPaid?: boolean;
  status?: string;
  amountDue?: number;
  linkConflicts?: { email: string; reason: 'already_in_another_group' }[];
  groupDiscount?: {
    status: 'applied' | 'not_eligible' | 'budget_exhausted' | 'disabled';
    perMember: number;
    groupSize: number;
  };
}

type LinkedContactStatus = 'linked' | 'pending' | 'invited' | 'conflict';

interface LinkedContactPayload {
  email: string;
  status: LinkedContactStatus;
  conflictReason?: string;
  userId?: string;
  registrationId?: string;
  invitedAt?: Date;
  linkedAt?: Date;
}

interface LinkConflict {
  email: string;
  reason: 'already_in_another_group';
}

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

  private normalizeContactEmails(input?: string[] | string): string[] {
    if (!input) return [];
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
    const items = Array.isArray(input) ? input : [input];
    const tokens = items
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(/[,\s;]+/) : []))
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => Boolean(entry) && emailPattern.test(entry));
    return Array.from(new Set(tokens));
  }

  private async assignGroupIdIfMissing(
    registrationIds: string[],
    groupId: string | mongoose.Types.ObjectId,
  ): Promise<void> {
    if (!registrationIds.length || !groupId) return;
    await this.registrationModel.updateMany(
      { _id: { $in: registrationIds }, groupId: { $exists: false } },
      { $set: { groupId } },
    );
  }

  private async reallocateGroupDiscounts(flagshipId: string): Promise<void> {
    await reallocateGroupDiscountsForFlagship(
      {
        registrationModel: this.registrationModel,
        flagshipModel: this.flagshipModel,
        userModel: this.userModel,
      },
      flagshipId,
    );
  }

  private async buildGroupDiscountSummary(
    registrationId: string,
    flagship: any,
  ): Promise<CreateRegistrationResult['groupDiscount'] | undefined> {
    const registration = await this.registrationModel
      .findById(registrationId)
      .select('groupId tripType discountApplied groupDiscountStatus')
      .lean()
      .exec();
    if (!registration || registration?.tripType !== 'group' || !registration?.groupId) {
      return undefined;
    }

    const groupId = String(registration.groupId);
    const groupRegistrations = await this.registrationModel
      .find({
        groupId,
        flagship: flagship?._id || flagship,
        tripType: 'group',
        cancelledAt: { $exists: false },
        refundStatus: { $ne: 'refunded' },
      })
      .select('discountApplied')
      .lean()
      .exec();

    const groupSize = groupRegistrations.length;
    const perMember = getGroupDiscountPerMember(groupSize);
    const groupEnabled = Boolean(flagship?.discounts?.group?.enabled);
    const storedStatus = registration?.groupDiscountStatus;
    if (storedStatus) {
      return { status: storedStatus, perMember, groupSize };
    }
    if (!groupEnabled) {
      return { status: 'disabled', perMember, groupSize };
    }
    if (!perMember) {
      return { status: 'not_eligible', perMember, groupSize };
    }

    const discountedCount = groupRegistrations.filter(
      (reg) => typeof reg.discountApplied === 'number' && reg.discountApplied >= perMember,
    ).length;
    const status = discountedCount === groupSize ? 'applied' : 'budget_exhausted';
    return { status, perMember, groupSize };
  }

  private buildRegistrationLink(flagshipId: string): string {
    const path = `/flagship/flagship-requirement?id=${flagshipId}&fromDetailsPage=true`;
    const base = process.env.FRONTEND_URL?.trim();
    return base ? `${base}${path}` : path;
  }

  private async upsertLinkedContact(
    registrationId: string,
    contact: LinkedContactPayload,
  ): Promise<void> {
    const updateResult = await this.registrationModel.updateOne(
      { _id: registrationId, 'linkedContacts.email': contact.email },
      {
        $set: {
          'linkedContacts.$.status': contact.status,
          'linkedContacts.$.conflictReason': contact.conflictReason ?? null,
          'linkedContacts.$.userId': contact.userId,
          'linkedContacts.$.registrationId': contact.registrationId,
          'linkedContacts.$.invitedAt': contact.invitedAt,
          'linkedContacts.$.linkedAt': contact.linkedAt,
        },
      },
    );

    const matched =
      typeof (updateResult as any)?.matchedCount === 'number'
        ? (updateResult as any).matchedCount
        : (updateResult as any)?.n || 0;

    if (!matched) {
      await this.registrationModel.updateOne(
        { _id: registrationId },
        { $addToSet: { linkedContacts: contact } },
      );
    }
  }

  private async notifyContactEmail(
    email: string,
    headline: string,
    message: string,
    actionUrl: string,
    actionLabel: string,
  ) {
    try {
      await this.mailService.sendTripLinkNotificationEmail({
        toEmail: email,
        subject: headline,
        headline,
        message,
        actionUrl,
        actionLabel,
      });
    } catch (error) {
      console.error('Failed to send contact email:', error);
    }
  }

  private async notifyContactUser(
    userId: string,
    title: string,
    message: string,
    link: string,
    metadata?: Record<string, any>,
  ) {
    try {
      await this.notificationService.createForUser(userId, {
        title,
        message,
        link,
        metadata,
      });
    } catch (error) {
      console.error('Failed to send in-app contact notification:', error);
    }
  }

  private async processOutboundLinks(
    registration: { _id: string; groupId?: string | mongoose.Types.ObjectId; tripType?: string },
    user: User,
    flagship: any,
    contactEmails: string[],
  ): Promise<{ linkedContacts: LinkedContactPayload[]; conflicts: LinkConflict[] }> {
    if (!contactEmails.length) {
      return { linkedContacts: [], conflicts: [] };
    }
    const now = new Date();
    const registrationId = String(registration._id);
    const registrationLink = this.buildRegistrationLink(String(flagship?._id || flagship));
    const userEmail = typeof user?.email === 'string' ? user.email.toLowerCase() : '';
    const cleanedEmails = contactEmails.filter((email) => email !== userEmail);
    const linkedContacts: LinkedContactPayload[] = [];
    const conflicts: LinkConflict[] = [];
    const sourceGroupId = registration?.groupId ? String(registration.groupId) : '';
    const sourceTripType = registration?.tripType;
    let activeGroupId = sourceGroupId;
    let groupLinkUpdated = false;

    for (const email of cleanedEmails) {
      const matchedUser = await this.userModel
        .findOne({ email })
        .select('_id email fullName')
        .lean()
        .exec();

      if (matchedUser?._id) {
        const matchedRegistration = await this.registrationModel
          .findOne({
            userId: matchedUser._id,
            flagship: flagship?._id || flagship,
            cancelledAt: { $exists: false },
            refundStatus: { $ne: 'refunded' },
          })
          .select('_id userId groupId tripType')
          .lean()
          .exec();

        if (matchedRegistration?._id) {
          const matchedGroupId = matchedRegistration?.groupId
            ? String(matchedRegistration.groupId)
            : '';
          const matchedTripType = matchedRegistration?.tripType;
          const enforceGroup =
            isGroupedTripType(sourceTripType) || isGroupedTripType(matchedTripType);
          if (enforceGroup && activeGroupId && matchedGroupId && activeGroupId !== matchedGroupId) {
            conflicts.push({ email, reason: 'already_in_another_group' });
            linkedContacts.push({
              email,
              status: 'conflict',
              conflictReason: 'already_in_another_group',
              userId: String(matchedUser._id),
            });
            continue;
          }
          const resolvedGroupId = enforceGroup
            ? activeGroupId || matchedGroupId || new mongoose.Types.ObjectId().toHexString()
            : '';

          if (enforceGroup && resolvedGroupId) {
            await this.assignGroupIdIfMissing(
              [registrationId, String(matchedRegistration._id)],
              resolvedGroupId,
            );
            activeGroupId = resolvedGroupId;
            groupLinkUpdated = true;
          }

          const linkedContact: LinkedContactPayload = {
            email,
            status: 'linked',
            userId: String(matchedUser._id),
            registrationId: String(matchedRegistration._id),
            linkedAt: now,
          };
          linkedContacts.push(linkedContact);

          if (userEmail) {
            await this.upsertLinkedContact(String(matchedRegistration._id), {
              email: userEmail,
              status: 'linked',
              userId: String(user._id),
              registrationId: registrationId,
              linkedAt: now,
            });
          }

          const tripName = flagship?.tripName || 'your trip';
          const headline = `Your registration is linked for ${tripName}`;
          const message = `${user?.fullName || 'A friend'} added you as a partner/group member. You are now linked for ${tripName}.`;
          await this.notifyContactUser(
            String(matchedUser._id),
            headline,
            message,
            registrationLink,
            { registrationId, flagshipId: String(flagship?._id || flagship) },
          );
          await this.notifyContactEmail(
            email,
            headline,
            message,
            registrationLink,
            'View trip',
          );

        } else {
          linkedContacts.push({
            email,
            status: 'pending',
            userId: String(matchedUser._id),
          });

          const tripName = flagship?.tripName || 'this trip';
          const headline = `Complete your registration for ${tripName}`;
          const message = `${user?.fullName || 'A friend'} mentioned you for ${tripName}. Register now to complete the link.`;
          await this.notifyContactUser(
            String(matchedUser._id),
            headline,
            message,
            registrationLink,
            { registrationId, flagshipId: String(flagship?._id || flagship) },
          );
          await this.notifyContactEmail(
            email,
            headline,
            message,
            registrationLink,
            'Register now',
          );
        }
      } else {
        linkedContacts.push({
          email,
          status: 'invited',
          invitedAt: now,
        });

        const tripName = flagship?.tripName || 'this trip';
        const headline = `You are invited to join ${tripName}`;
        const message = `${user?.fullName || 'A friend'} mentioned you for ${tripName}. Join 3Musafir and register to complete the link.`;
        await this.notifyContactEmail(
          email,
          headline,
          message,
          registrationLink,
          'Join & register',
        );
      }
    }
    if (groupLinkUpdated) {
      await this.reallocateGroupDiscounts(String(flagship?._id || flagship));
    }

    return { linkedContacts, conflicts };
  }

  private async processInboundLinks(
    registrationId: string,
    user: User,
    flagship: any,
  ): Promise<LinkConflict[]> {
    const userEmail = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!userEmail) return [];

    const now = new Date();
    const conflicts: LinkConflict[] = [];
    const currentRegistration = await this.registrationModel
      .findById(registrationId)
      .select('_id groupId tripType')
      .lean()
      .exec();
    const currentGroupId = currentRegistration?.groupId
      ? String(currentRegistration.groupId)
      : '';
    const currentTripType = currentRegistration?.tripType;
    let activeGroupId = currentGroupId;
    const pendingRegistrations = await this.registrationModel
      .find({
        flagship: flagship?._id || flagship,
        'linkedContacts.email': userEmail,
        cancelledAt: { $exists: false },
        refundStatus: { $ne: 'refunded' },
      })
      .select('_id linkedContacts userId groupId tripType')
      .lean()
      .exec();

    let groupLinkUpdated = false;
    for (const pending of pendingRegistrations) {
      const pendingId = String(pending._id);
      if (pendingId === registrationId) continue;

      const pendingUserId = pending.userId ? String(pending.userId) : '';
      const pendingUser = pendingUserId
        ? await this.userModel.findById(pendingUserId).select('email').lean().exec()
        : null;
      const pendingUserEmail =
        typeof pendingUser?.email === 'string' ? pendingUser.email.trim().toLowerCase() : '';

      const pendingGroupId = pending?.groupId ? String(pending.groupId) : '';
      const pendingTripType = pending?.tripType;
      const enforceGroup =
        isGroupedTripType(currentTripType) || isGroupedTripType(pendingTripType);
      if (enforceGroup && activeGroupId && pendingGroupId && activeGroupId !== pendingGroupId) {
        await this.upsertLinkedContact(pendingId, {
          email: userEmail,
          status: 'conflict',
          conflictReason: 'already_in_another_group',
          userId: String(user._id),
          registrationId: registrationId,
        });
        const conflictEmail = pendingUserEmail || 'member already in another group';
        conflicts.push({ email: conflictEmail, reason: 'already_in_another_group' });
        await this.upsertLinkedContact(registrationId, {
          email: conflictEmail,
          status: 'conflict',
          conflictReason: 'already_in_another_group',
          userId: pendingUserId || undefined,
          registrationId: pendingId,
        });
        if (pendingUserId) {
          try {
            await this.notificationService.createForUser(pendingUserId, {
              title: 'Group link conflict',
              message: `${user?.fullName || 'A member'} could not be linked because they are already in another group.`,
              type: 'general',
              metadata: {
                registrationId: pendingId,
                conflictEmail: userEmail,
              },
            });
          } catch (error) {
            console.error('Failed to send inbound group conflict notification:', error);
          }
        }
        continue;
      }

      const resolvedGroupId = enforceGroup
        ? activeGroupId || pendingGroupId || new mongoose.Types.ObjectId().toHexString()
        : '';

      if (enforceGroup && resolvedGroupId) {
        await this.assignGroupIdIfMissing(
          [registrationId, pendingId],
          resolvedGroupId,
        );
        activeGroupId = resolvedGroupId;
        groupLinkUpdated = true;
      }

      await this.upsertLinkedContact(pendingId, {
        email: userEmail,
        status: 'linked',
        userId: String(user._id),
        registrationId: registrationId,
        linkedAt: now,
      });

      if (pendingUserEmail) {
        await this.upsertLinkedContact(registrationId, {
          email: pendingUserEmail,
          status: 'linked',
          userId: pendingUserId,
          registrationId: pendingId,
          linkedAt: now,
        });
      }

    }

    if (groupLinkUpdated) {
      await this.reallocateGroupDiscounts(String(flagship?._id || flagship));
    }

    return conflicts;
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

  private parseAmount(value: unknown): number {
    if (value === undefined || value === null) return 0;
    const numeric = value.toString().replace(/[^0-9.-]/g, '');
    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private resolveBasePrice(flagship: any, now = new Date()): number {
    const basePrice = this.parseAmount(flagship?.basePrice);
    const earlyBirdPrice = this.parseAmount(flagship?.earlyBirdPrice);
    const deadlineValue = flagship?.earlyBirdDeadline;
    if (earlyBirdPrice > 0 && deadlineValue) {
      const deadline = new Date(deadlineValue);
      if (!Number.isNaN(deadline.getTime()) && now <= deadline) {
        return earlyBirdPrice;
      }
    }
    return basePrice;
  }

  private resolveRegistrationPrice(
    flagship: any,
    registration: CreateRegistrationDto,
    now = new Date(),
  ): number {
    let total = this.resolveBasePrice(flagship, now);

    if (registration?.joiningFromCity && Array.isArray(flagship?.locations)) {
      const location = flagship.locations.find(
        (loc: any) =>
          loc?.enabled && String(loc?.name) === String(registration.joiningFromCity),
      );
      total += this.parseAmount(location?.price);
    }

    if (registration?.tier && Array.isArray(flagship?.tiers)) {
      const tier = flagship.tiers.find(
        (t: any) => String(t?.name) === String(registration.tier),
      );
      total += this.parseAmount(tier?.price);
    }

    if (registration?.roomSharing && Array.isArray(flagship?.roomSharingPreference)) {
      const desired = String(registration.roomSharing).toLowerCase();
      const preference = flagship.roomSharingPreference.find((pref: any) => {
        const name = String(pref?.name || '').toLowerCase();
        const key = name.includes('twin') ? 'twin' : 'default';
        return key === desired || name === desired;
      });
      total += this.parseAmount(preference?.price);
    }

    if (registration?.bedPreference === 'bed' && Array.isArray(flagship?.mattressTiers)) {
      total += this.parseAmount(flagship.mattressTiers[0]?.price);
    }

    return Math.max(0, total);
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

  async createRegistration(registration: CreateRegistrationDto, userId: string): Promise<CreateRegistrationResult> {
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

      const normalizedContacts = this.normalizeContactEmails(registration.groupMembers);
      const cleanedContacts =
        registration.tripType === 'partner'
          ? normalizedContacts.slice(0, 1)
          : registration.tripType === 'group'
            ? normalizedContacts
            : [];
      if (registration.tripType === 'partner') {
        const userEmail = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
        const partnerEmail = cleanedContacts[0]?.toLowerCase();
        if (!partnerEmail) {
          throw new BadRequestException('Partner email is required for couple registrations.');
        }
        if (userEmail && partnerEmail === userEmail) {
          throw new BadRequestException('Partner email must be different from your own.');
        }
      }
      if (registration.tripType === 'partner' && cleanedContacts.length === 0) {
        throw new BadRequestException('Partner email is required for couple registrations.');
      }
      const groupId = isGroupedTripType(registration.tripType)
        ? new mongoose.Types.ObjectId()
        : undefined;
      const registrationPrice = this.resolveRegistrationPrice(flagship, registration);
      const initialStatus =
        user?.verification?.status === VerificationStatus.VERIFIED
          ? 'payment'
          : 'onboarding';

      const newRegistration = new this.registrationModel({
        ...registration,
        groupMembers: cleanedContacts,
        groupId,
        price: registrationPrice,
        amountDue: registrationPrice,
        status: initialStatus,
        userGender: user?.gender,
        waitlistOfferStatus: 'none',
        userId: userId,
        user: user,
        flagship: new mongoose.Types.ObjectId(registration.flagshipId)
      });

      const createdRegistration = await newRegistration.save();

      let linkConflicts: LinkConflict[] = [];
      try {
        const outboundResult = await this.processOutboundLinks(
          {
            _id: String(createdRegistration._id),
            groupId: createdRegistration.groupId,
            tripType: createdRegistration.tripType,
          },
          user,
          flagship,
          cleanedContacts,
        );
        if (outboundResult.linkedContacts.length > 0) {
          await this.registrationModel.findByIdAndUpdate(
            createdRegistration._id,
            { $set: { linkedContacts: outboundResult.linkedContacts } },
          );
        }
        const inboundConflicts = await this.processInboundLinks(
          String(createdRegistration._id),
          user,
          flagship,
        );
        const merged = [...outboundResult.conflicts, ...inboundConflicts];
        linkConflicts = merged.filter(
          (conflict, index, self) =>
            self.findIndex((item) => item.email === conflict.email) === index,
        );
      } catch (error) {
        console.error('Failed to process registration links:', error);
      }

      
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
          groupMembers: cleanedContacts,
          expectations: registration.expectations,
          tripType: registration.tripType,
          price: registrationPrice,
          amountDue: registrationPrice,
          createdAt: createdRegistration.createdAt,
          startDate: regFlagship?.startDate,
          endDate: regFlagship?.endDate,
          destination: regFlagship?.destination,
          category: regFlagship?.category,
        });
      } catch (e) {
        console.log('Failed to send admin registration notification:', e);
      }

      const groupDiscount = await this.buildGroupDiscountSummary(
        String(createdRegistration._id),
        flagship,
      );
      const message = linkConflicts.length
        ? 'Registration created. Some members are already linked to another group.'
        : 'Registration created successfully.';
      if (linkConflicts.length) {
        try {
          const conflictList = linkConflicts.map((conflict) => conflict.email).join(', ');
          await this.notificationService.createForUser(userId, {
            title: 'Group link conflict',
            message: `These members are already linked to another group: ${conflictList}.`,
            type: 'general',
            metadata: {
              registrationId: String(createdRegistration._id),
              conflicts: linkConflicts,
            },
          });
        } catch (error) {
          console.error('Failed to send group link conflict notification:', error);
        }
      }

      return {
        registrationId: String(createdRegistration._id),
        message,
        linkConflicts: linkConflicts.length ? linkConflicts : undefined,
        groupDiscount,
      };
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

      if (registration?.flagship?.images && registration.flagship.images.length > 0) {
        registration.flagship.images = await Promise.all(
          registration.flagship.images.map(async (imageKey) => {
            return await this.storageService.getSignedUrl(imageKey);
          })
        );
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

    if (registration.tripType === 'group' && registration.groupId) {
      const flagshipId = String(registration.flagship || registration.flagshipId || '');
      if (flagshipId) {
        try {
          await this.reallocateGroupDiscounts(flagshipId);
        } catch (error) {
          console.error('Failed to reallocate group discounts after cancellation:', error);
        }
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

    if (registration?.tripType === 'group' && registration?.groupId && flagshipId) {
      try {
        await this.reallocateGroupDiscounts(flagshipId);
      } catch (error) {
        console.error('Failed to reallocate group discounts after deletion:', error);
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
