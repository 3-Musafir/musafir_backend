import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateFlagshipDto } from './dto/create-flagship.dto';
import { UpdateFlagshipDto } from './dto/update-flagship.dto';
import { Flagship } from './interfaces/flagship.interface';
import { User } from 'src/user/interfaces/user.interface';
import dayjs = require('dayjs');
import { Registration } from 'src/registration/interfaces/registration.interface';
import { Payment } from 'src/payment/interface/payment.interface';
import { FlagshipFilterDto } from './dto/get-flagship.dto';
import { RegistrationService } from 'src/registration/registration.service';
import { MailService } from 'src/mail/mail.service';
import { successResponse, errorResponse } from '../constants/response';
import { StorageService } from 'src/storage/storageService';
import sharp from 'sharp';
import { NotificationService } from 'src/notifications/notification.service';
import { VerificationStatus } from 'src/constants/verification-status.enum';
import { UserService } from 'src/user/user.service';

@Injectable()
export class FlagshipService {
  constructor(
    @InjectModel('Flagship') private readonly flagshipModel: Model<Flagship>,
    private readonly registrationService: RegistrationService,
    private readonly mailService: MailService,
    private readonly storageService: StorageService,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Registration')
    private readonly registerationModel: Model<Registration>,
    @InjectModel('Payment')
    private readonly paymentModel: Model<Payment>,
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
  ) { }

  async create(createFlagshipDto: CreateFlagshipDto): Promise<Flagship> {
    const startDate = dayjs(createFlagshipDto.startDate);
    const endDate = dayjs(createFlagshipDto.endDate);
    const diffDays = endDate.diff(startDate, 'day');
    createFlagshipDto.days = diffDays;
    const newFlagship = new this.flagshipModel(createFlagshipDto);
    const saved = await newFlagship.save();
    await this.notifyNewFlagship(saved);
    return saved;
  }

  async createFlagship(
    createFlagshipDto: CreateFlagshipDto,
  ): Promise<Flagship> {
    const startDate = new Date(createFlagshipDto.startDate);
    const endDate = new Date(createFlagshipDto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException('Start date must be before end date.');
    }

    const flagship = new this.flagshipModel(createFlagshipDto);
    return flagship.save();
  }

  async findAll(): Promise<Flagship[]> {
    return await this.flagshipModel.find().exec();
  }

  async getAllFlagships(
    filterDto: FlagshipFilterDto,
    options?: { excludeRegisteredUserId?: string },
  ): Promise<Flagship[]> {
    const query: any = {};

    const buildStringQuery = (value: string) => ({
      $regex: new RegExp(value, 'i'),
    });

    const exactMatchFields = new Set([
      'status',
      'visibility',
      'category',
      'created_By',
      'createdBy',
    ]);

    const dateFields = new Set(['startDate', 'endDate', 'registrationDeadline', 'advancePaymentDeadline', 'earlyBirdDeadline']);

    for (const key of Object.keys(filterDto)) {
      const value = filterDto[key];
      if (value !== undefined) {
        if (key === 'includePast') {
          continue;
        }
        if (dateFields.has(key) && typeof value === 'string') {
          const asDate = new Date(value);
          if (!Number.isNaN(asDate.getTime())) {
            query[key] = asDate;
            continue;
          }
        }
        if (exactMatchFields.has(key)) {
          query[key] = value;
          continue;
        }
        if (typeof value === 'string') {
          query[key] = buildStringQuery(value);
        } else if (typeof value === 'object' && value !== null) {
          query[key] = value;
        } else {
          query[key] = value;
        }
      }
    }

    if (options?.excludeRegisteredUserId) {
      const registeredFlagshipIds = await this.registerationModel.distinct(
        'flagship',
        { userId: options.excludeRegisteredUserId },
      );

      if (Array.isArray(registeredFlagshipIds) && registeredFlagshipIds.length > 0) {
        if (query._id) {
          query.$and = Array.isArray(query.$and) ? query.$and : [];
          query.$and.push({ _id: query._id });
          delete query._id;
          query.$and.push({ _id: { $nin: registeredFlagshipIds } });
        } else {
          query._id = { $nin: registeredFlagshipIds };
        }
      }
    }

    const sort: Record<string, 1 | -1> =
      filterDto?.status === 'completed' ? { endDate: -1 } : { startDate: 1 };

    const flagships = await this.flagshipModel
      .find(query)
      .sort(sort)
      .populate('created_By')
      .exec();

    const processedFlagships = await Promise.all(
      flagships.map(async (flagship) => {
        const flagshipObj = flagship.toObject();
        if (flagship.images && flagship.images.length > 0) {
          const imageUrls = await Promise.all(
            flagship.images.map(async (imageKey) => {
              return await this.storageService.getSignedUrl(imageKey);
            }),
          );
          flagshipObj.images = imageUrls;
        }
        return flagshipObj;
      }),
    );

    return processedFlagships;
  }

  async findOne(
    id: string,
    options?: { restrictToPublishedPublic?: boolean },
  ): Promise<Flagship> {
    const query: any = { _id: id };
    if (options?.restrictToPublishedPublic) {
      query.visibility = 'public';
      query.status = 'published';
    }

    const flagship = await this.flagshipModel.findOne(query).exec();
    if (!flagship) {
      throw new NotFoundException(`Flagship not found`);
    }

    if (flagship.images && flagship.images.length > 0) {
      const imageUrls = await Promise.all(
        flagship.images.map(async (imageKey) => {
          return await this.storageService.getSignedUrl(imageKey);
        }),
      );
      flagship.images = imageUrls;
    }

    if (flagship.detailedPlan) {
      flagship.detailedPlan = await this.storageService.getSignedUrl(
        flagship.detailedPlan,
      );
    }

    return flagship;
  }

  private async notifyNewFlagship(flagship: Flagship) {
    try {
      const users = await this.userModel
        .find({ roles: { $ne: 'admin' } })
        .select('_id')
        .lean();
      const userIds = users.map((u) => u._id.toString());
      if (userIds.length === 0) return;

      await this.notificationService.createForUsers(userIds, {
        title: 'New Flagship Posted',
        message: `${flagship.tripName} is now live. Check it out!`,
        type: 'flagship',
        link: `/flagship/details?id=${flagship['_id']}`,
        metadata: { flagshipId: flagship['_id'] },
      });
    } catch (error) {
      console.log('Failed to broadcast flagship notification', error?.message || error);
    }
  }

  async update(
    id: number,
    updateFlagshipDto: UpdateFlagshipDto,
  ): Promise<Flagship> {
    const updatedFlagship = await this.flagshipModel
      .findByIdAndUpdate(id, updateFlagshipDto, { new: true })
      .exec();
    if (!updatedFlagship) {
      throw new NotFoundException(`Flagship with ID ${id} not found`);
    }
    return updatedFlagship;
  }

  async updateFlagship(
    id: string,
    updateDto: UpdateFlagshipDto,
  ): Promise<Flagship> {
    const updateData: Partial<UpdateFlagshipDto> = {};
    const allowedFields: (keyof UpdateFlagshipDto)[] = [
      'totalSeats',
      'femaleSeats',
      'maleSeats',
      'citySeats',
      'bedSeats',
      'mattressSeats',
      'roomSharingPreference',
      'tocs',
      'travelPlan',
      'locations',
      'basePrice',
      'mattressTiers',
      'tiers',
      'discounts',
      'selectedBank',
      'publish',
      'status',
      'visibility',
      'tripDates',
      'registrationDeadline',
      'advancePaymentDeadline',
      'earlyBirdDeadline',
    ];

    allowedFields.forEach((field) => {
      if (updateDto[field] !== undefined) {
        (updateData as any)[field] = updateDto[field];
      }
    });

    if (updateDto.files && updateDto.files.length > 0) {
      try {
        const existingFlagship = await this.flagshipModel.findById(id);
        if (!existingFlagship) {
          throw new NotFoundException('Flagship not found');
        }
        const imageKeys: string[] = existingFlagship.images || [];

        for (const file of updateDto.files) {
          try {
            const webpBuffer = await sharp(file.buffer)
              .webp({ quality: 80 })
              .toBuffer();

            const originalName = file.originalname.split('.')[0];
            const fileKey = `flagship/${id}/${Date.now()}-${originalName}.webp`;

            await this.storageService.uploadFile(
              fileKey,
              webpBuffer,
              'image/webp',
            );

            imageKeys.push(fileKey);
          } catch (error) {
            throw new BadRequestException(
              `Failed to upload file ${file.originalname}: ${error.message}`,
            );
          }
        }

        updateData['images'] = imageKeys;
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        throw new BadRequestException(
          `Failed to process file uploads: ${error.message}`,
        );
      }
    }

    if (updateDto.detailedPlanDoc) {
      const detailedPlanKey = `flagship/${id}/detailed-plan-${Date.now()}-${updateDto.detailedPlanDoc.originalname}`;
      await this.storageService.uploadFile(
        detailedPlanKey,
        updateDto.detailedPlanDoc.buffer,
        updateDto.detailedPlanDoc.mimetype || 'application/octet-stream',
      );
      updateData['detailedPlan'] = detailedPlanKey;
    }

    const updatedFlagship = await this.flagshipModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!updatedFlagship) {
      throw new NotFoundException('Flagship not found');
    }

    return updatedFlagship;
  }

  async remove(id: number): Promise<Flagship> {
    const deletedFlagship = await this.flagshipModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedFlagship) {
      throw new NotFoundException(`Flagship with ID ${id} not found`);
    }
    return deletedFlagship;
  }

  async sendTripQuery(tripQuery: string, flagshipId: string, user: User) {
    const flagship = await this.flagshipModel.findById(flagshipId);
    if (!flagship) {
      throw new NotFoundException(`Flagship with ID ${flagshipId} not found`);
    }

    const sent = await this.mailService.sendTripQuery(
      flagshipId,
      flagship.tripName,
      user.fullName,
      user.email,
      user.phone,
      user?.city,
      tripQuery,
    );

    if (sent !== true) {
      // Defensive: mail service should throw on failure, but don't report success if it doesn't.
      throw new InternalServerErrorException('Failed to send trip query');
    }

    return 'Trip query sent successfully.';
  }

  // TODOS
  async findRegisteredUsers(
    id: string,
    search: string,
    filters?: {
      limit?: number;
      page?: number;
      verificationStatus?: string;
      rejectedOnly?: boolean;
      excludeVerificationStatus?: string;
    },
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid flagship identifier.');
    }
    const flagshipObjectId = new Types.ObjectId(id);
    const limit =
      filters?.limit && filters.limit > 0 ? Math.min(filters.limit, 200) : undefined;
    const page = filters?.page && filters.page > 1 ? filters.page : 1;
    const skip = limit ? (page - 1) * limit : undefined;

    const parseStatus = (value?: string): VerificationStatus | null => {
      if (!value) return null;
      const normalized = value.trim().toLowerCase();
      if (normalized === 'all') return null;
      if (Object.values(VerificationStatus).includes(normalized as VerificationStatus)) {
        return normalized as VerificationStatus;
      }
      return null;
    };

    const pipeline: any[] = [
      { $match: { flagship: flagshipObjectId } },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: false,
        },
      },
    ];

    const trimmedSearch = (search || '').trim();
    if (trimmedSearch.length > 0) {
      pipeline.push({
        $match: {
          'user.fullName': { $regex: trimmedSearch, $options: 'i' },
        },
      });
    }

    pipeline.push({
      $match: {
        $or: [
          { latestPaymentStatus: { $in: ['none', 'rejected'] } },
          { latestPaymentStatus: { $exists: false } },
        ],
      },
    });

    const verificationFilter = filters?.verificationStatus?.toLowerCase();
    const statusMatch = parseStatus(verificationFilter ?? undefined);
    if (statusMatch) {
      pipeline.push({
        $match: {
          'user.verification.status': statusMatch,
        },
      });
    }

    const excludeStatuses =
      filters?.excludeVerificationStatus
        ?.split(',')
        .map((value) => parseStatus(value))
        .filter((value): value is VerificationStatus => Boolean(value)) || [];
    if (excludeStatuses.length > 0) {
      pipeline.push({
        $match: {
          'user.verification.status': { $nin: excludeStatuses },
        },
      });
    }

    if (filters?.rejectedOnly) {
      pipeline.push({
        $match: {
          status: 'waitlisted',
          waitlistOfferStatus: 'rejected',
        },
      });
    }

    pipeline.push({ $sort: { createdAt: -1 } });
    if (skip !== undefined) {
      pipeline.push({ $skip: skip });
    }
    if (limit !== undefined) {
      pipeline.push({ $limit: limit });
    }

    return this.registerationModel.aggregate(pipeline).exec();
  }

  async findPendingVerificationUsers(
    id: string,
    options?: { limit?: number; page?: number },
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid flagship identifier.');
    }
    const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 200) : undefined;
    const page = options?.page && options.page > 1 ? options.page : 1;
    const skip = limit ? (page - 1) * limit : undefined;

    const flagshipObjectId = new Types.ObjectId(id);
    const pipeline: any[] = [
      { $match: { flagship: flagshipObjectId } },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $match: {
          'user.verification.status': {
            $in: [VerificationStatus.PENDING, VerificationStatus.UNVERIFIED],
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    if (skip !== undefined) {
      pipeline.push({ $skip: skip });
    }
    if (limit !== undefined) {
      pipeline.push({ $limit: limit });
    }

    return this.registerationModel.aggregate(pipeline).exec();
  }

  async findPendingPaymentVerifications(
    id: string,
    options?: { limit?: number; page?: number; paymentType?: string },
  ) {
    const limit = Math.max(1, Math.min(200, options?.limit && options.limit > 0 ? options.limit : 20));
    const page = options?.page && options.page > 1 ? options.page : 1;
    const skip = (page - 1) * limit;

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid flagship identifier.');
    }
    const flagshipObjectId = new Types.ObjectId(id);

    const pipeline: any[] = [
      { $match: { status: 'pendingApproval' } },
      {
        $lookup: {
          from: 'registrations',
          localField: 'registration',
          foreignField: '_id',
          as: 'registration',
        },
      },
      { $unwind: '$registration' },
      { $match: { 'registration.flagship': flagshipObjectId } },
    ];

    if (options?.paymentType) {
      pipeline.push({ $match: { paymentType: options.paymentType } });
    }

    pipeline.push(
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$registration._id',
          payment: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$payment' } },
      {
        $lookup: {
          from: 'users',
          localField: 'registration.user',
          foreignField: '_id',
          as: 'registration_user',
        },
      },
      {
        $unwind: {
          path: '$registration_user',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          registration: {
            $mergeObjects: [
              '$registration',
              {
                user: {
                  $ifNull: ['$registration_user', '$registration.user'],
                },
              },
            ],
          },
        },
      },
      {
        $project: {
          registration_user: 0,
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          results: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    );

    const aggregateResult = (await this.paymentModel.aggregate(pipeline).exec()) || [];
    const facet = aggregateResult[0] || { results: [], total: [{ count: 0 }] };
    const payments = facet.results || [];
    const total = Number(facet.total?.[0]?.count || 0);

    return {
      payments,
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async findPaidUsers(
    id: string,
    paymentType: string,
    options?: { limit?: number; page?: number },
  ) {
    const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 200) : undefined;
    const page = options?.page && options.page > 1 ? options.page : 1;
    const skip = limit ? (page - 1) * limit : undefined;

    const query = this.registerationModel
      .find({ flagship: id })
      .sort({ createdAt: -1 })
      .populate({
        path: 'user',
        model: 'User',
        select: '_id fullName city verification profileImg',
      })
      .lean();

    if (limit) query.limit(limit);
    if (skip) query.skip(skip);

    const registrations = await query.exec();

    if (!registrations || registrations.length === 0) return [];

    const registrationIds = registrations.map((r: any) => r._id);
    const approvedPayments = await this.paymentModel
      .find({
        registration: { $in: registrationIds },
        status: 'approved',
        paymentType,
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const latestByRegistration = new Map<string, any>();
    for (const payment of approvedPayments) {
      const regId = String((payment as any).registration);
      if (!latestByRegistration.has(regId)) {
        latestByRegistration.set(regId, payment);
      }
    }

    return registrations
      .map((r: any) => ({
        ...r,
        payment: latestByRegistration.get(String(r._id)) || null,
      }))
      .filter((r: any) => r.payment);
  }

  async getRegistrationByID(id: string) {
    const registration = await this.registerationModel
      .findOne({ _id: id })
      .populate({ path: 'user', model: 'User' })
      .exec();

    if (!registration) {
      throw new NotFoundException('Registration Not Found');
    }

    return registration;
  }

  async sendPaymentReminders(flagshipId: string, registrationIds?: string[]) {
    if (!Types.ObjectId.isValid(flagshipId)) {
      throw new BadRequestException('Invalid flagship identifier.');
    }

    const now = new Date();
    const cooldownCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const flagshipObjectId = new Types.ObjectId(flagshipId);

    const filter: Record<string, any> = {
      flagship: flagshipObjectId,
      cancelledAt: { $exists: false },
      refundStatus: { $nin: ['pending', 'processing', 'refunded'] },
      status: { $in: ['payment', 'onboarding', 'new'] },
      isPaid: { $ne: true },
      amountDue: { $gt: 0 },
      latestPaymentStatus: { $nin: ['pendingApproval', 'approved'] },
      $or: [
        { lastPaymentReminderAt: { $exists: false } },
        { lastPaymentReminderAt: { $lte: cooldownCutoff } },
      ],
    };

    if (Array.isArray(registrationIds) && registrationIds.length > 0) {
      const validIds = registrationIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      if (validIds.length === 0) {
        throw new BadRequestException('No valid registration IDs provided.');
      }
      filter._id = { $in: validIds };
    }

    const registrations = await this.registerationModel
      .find(filter)
      .populate({
        path: 'user',
        select: '_id fullName email verification',
      })
      .populate({
        path: 'flagship',
        select: 'tripName',
      })
      .lean()
      .exec();

    const frontendBase = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const result = {
      totalEligible: registrations.length,
      notificationsSent: 0,
      emailsSent: 0,
      skipped: 0,
    };
    const updatedIds: Types.ObjectId[] = [];
    const batchSize = 10;

    const sendReminder = async (registration: any) => {
      const user = registration?.user;
      const userId = user?._id?.toString?.();
      if (!userId) {
        result.skipped += 1;
        return;
      }

      const tripName =
        (registration?.flagship as any)?.tripName || 'your trip';
      const registrationId = registration?._id?.toString?.();
      const paymentPath = registrationId
        ? `/musafir/payment/${registrationId}`
        : '/passport';
      const paymentLink = frontendBase
        ? `${frontendBase}${paymentPath}`
        : paymentPath;
      const verificationStatus = String(user?.verification?.status || '').toLowerCase();
      const needsVerification = verificationStatus !== VerificationStatus.VERIFIED;

      let sent = false;

      try {
        await this.notificationService.createForUser(userId, {
          title: needsVerification
            ? 'Complete verification to pay'
            : 'Payment reminder',
          message: needsVerification
            ? `Complete verification to proceed with payment for ${tripName}.`
            : `Please complete your payment for ${tripName}.`,
          type: 'payment',
          link: paymentPath,
          metadata: {
            kind: 'payment_reminder',
            registrationId,
            flagshipId: String(flagshipId),
            needsVerification,
          },
        });
        result.notificationsSent += 1;
        sent = true;
      } catch (error) {
        console.log('Failed to send payment reminder notification:', error);
      }

      if (user?.email) {
        try {
          await this.mailService.sendPaymentReminderEmail(
            user.email,
            user.fullName || 'Musafir',
            tripName,
            paymentLink,
            needsVerification,
          );
          result.emailsSent += 1;
          sent = true;
        } catch (error) {
          console.log('Failed to send payment reminder email:', error);
        }
      }

      if (sent && registration?._id) {
        updatedIds.push(registration._id as Types.ObjectId);
      } else if (!sent) {
        result.skipped += 1;
      }
    };

    for (let i = 0; i < registrations.length; i += batchSize) {
      const batch = registrations.slice(i, i + batchSize);
      await Promise.all(batch.map((registration) => sendReminder(registration)));
    }

    if (updatedIds.length > 0) {
      await this.registerationModel.updateMany(
        { _id: { $in: updatedIds } },
        { $set: { lastPaymentReminderAt: now } },
      );
    }

    return {
      ...result,
      updated: updatedIds.length,
    };
  }

  async getRegisterationStats(id: string) {
    const flagship = await this.flagshipModel.findById(id);
    if (!flagship) {
      throw new NotFoundException(`Flagship with ID ${id} not found`);
    }

    await this.registrationService.processWaitlistForFlagship(id);

    // Get all registrations for this flagship
    const registrations = await this.registerationModel
      .find({ flagship: id })
      .populate({ path: 'user', model: 'User', select: 'gender dateOfBirth location city _id' })
      .populate({
        path: 'paymentId',
        model: 'Payment',
        match: { status: 'approved' },
      })
      .lean()
      .exec();

    // Get all registrations for other flagships to derive returning users via distinct user IDs
    const returningUserIdsRaw = await this.registerationModel.distinct('user', {
      flagship: { $ne: id },
    });

    // Create a set of user IDs who have registered for other flagships
    const returningUserIds = new Set(
      returningUserIdsRaw.map((userId) => String(userId)),
    );

    // Count new and returning users
    let newUsersCount = 0;
    let returningUsersCount = 0;

    registrations.forEach((reg) => {
      if (reg.user?._id) {
        if (returningUserIds.has(reg.user._id.toString())) {
          returningUsersCount++;
        } else {
          newUsersCount++;
        }
      }
    });

    // Calculate days until start
    const startDate = new Date(flagship.startDate);
    const today = new Date();
    const daysUntilStart = Math.ceil(
      (startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    const newCount = registrations.filter((reg) => reg.status === 'new').length;
    const onboardingCount = registrations.filter((reg) => reg.status === 'onboarding').length;
    const paymentCount = registrations.filter((reg) => reg.status === 'payment').length;
    const waitlistedCount = registrations.filter((reg) => reg.status === 'waitlisted').length;
    const confirmedCount = registrations.filter((reg) => reg.status === 'confirmed').length;
    const cancelledCount = registrations.filter((reg: any) => Boolean((reg as any).cancelledAt)).length;
    const paidCount = registrations.filter((reg) => reg.payment !== null).length;

    const pendingCount = onboardingCount + newCount;
    const acceptedCount = confirmedCount;
    const rejectedCount = waitlistedCount;

    // Get city seats
    const citySeats = flagship.citySeats as Record<string, number>;
    const lahoreSeats = citySeats?.lahore || 0;
    const islamabadSeats = citySeats?.islamabad || 0;
    const karachiSeats = citySeats?.karachi || 0;

    // Calculate gender distribution
    const maleCount = registrations.filter(
      (reg) => reg.user?.gender === 'male',
    ).length;
    const femaleCount = registrations.filter(
      (reg) => reg.user?.gender === 'female',
    ).length;
    const maleSeats = flagship.maleSeats || 0;
    const femaleSeats = flagship.femaleSeats || 0;

    // Calculate age distribution
    const ageRanges = {
      '0-9': 0,
      '10-19': 0,
      '20-29': 0,
      '30-39': 0,
      '40-49': 0,
      '50+': 0,
    };

    registrations.forEach((reg) => {
      if (reg.user?.dateOfBirth) {
        const birthDate = new Date(reg.user.dateOfBirth);
        const age = today.getFullYear() - birthDate.getFullYear();

        if (age < 10) ageRanges['0-9']++;
        else if (age < 20) ageRanges['10-19']++;
        else if (age < 30) ageRanges['20-29']++;
        else if (age < 40) ageRanges['30-39']++;
        else if (age < 50) ageRanges['40-49']++;
        else ageRanges['50+']++;
      }
    });

    // Get top universities
    const universityCounts = registrations.reduce(
      (acc, reg) => {
        if (reg.user?.university) {
          acc[reg.user.university] = (acc[reg.user.university] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    const topUniversities = Object.entries(universityCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([university, count]) => ({ university, count }));

    return {
      flagshipName: flagship.tripName,
      daysUntilStart,
      totalRegistrations: registrations.length,
      pendingCount,
      acceptedCount,
      rejectedCount,
      paidCount,
      newCount,
      onboardingCount,
      paymentCount,
      waitlistedCount,
      confirmedCount,
      cancelledCount,
      teamSeats: flagship.totalSeats || 0,
      lahoreSeats,
      islamabadSeats,
      karachiSeats,
      maleCount,
      femaleCount,
      maleSeats,
      femaleSeats,
      ageDistribution: ageRanges,
      topUniversities,
      newUsersCount,
      returningUsersCount,
    };
  }

  async gePaymentStats(id: string) {}

  async approveRegisteration(id: string, comment: string) {
    throw new BadRequestException({
      message: 'Registration approvals are handled through verification and payment flows.',
      code: 'registration_approval_deprecated',
    });
  }

  async rejectRegisteration(id: string, comment: string) {
    throw new BadRequestException({
      message: 'Registration rejection is handled through verification and waitlist flows.',
      code: 'registration_rejection_deprecated',
    });
  }

  async didntPickRegistration(id: string, comment: string) {
    throw new BadRequestException({
      message: 'This action is deprecated in the new registration lifecycle.',
      code: 'registration_action_deprecated',
    });
  }

  async verifyUser(id: string, comment?: string, registrationId?: string) {
    return this.userService.updateVerificationStatus(
      id,
      VerificationStatus.VERIFIED,
      comment,
      { registrationId },
    );
  }

  async rejectVerification(id: string, comment: string) {
    return this.userService.rejectUser(id, comment);
  }

  async getPastTrips() {
    const currentDate = new Date();
    const pastTrips = await this.flagshipModel
      .find({
        endDate: { $lt: currentDate },
      })
      .sort({ endDate: -1 })
      .exec();

    const processedFlagships = await Promise.all(
      pastTrips.map(async (flagship) => this.attachSignedImages(flagship)),
    );

    return processedFlagships;
  }

  async getLiveTrips() {
    const liveTrips = await this.flagshipModel
      .find({
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
      })
      .sort({ startDate: 1 });

    const processedFlagships = await Promise.all(
      liveTrips.map(async (flagship) => this.attachSignedImages(flagship)),
    );

    return processedFlagships;
  }

  async getUpcomingTrips() {
    const upcomingTrips = await this.flagshipModel
      .find({
        startDate: { $gt: new Date() },
      })
      .sort({ startDate: 1 });

    const processedFlagships = await Promise.all(
      upcomingTrips.map(async (flagship) => this.attachSignedImages(flagship)),
    );

    return processedFlagships;
  }

  /**
   * Safely attach signed image URLs; on failure, fall back to original keys.
   */
  private async attachSignedImages(flagship: any) {
    const flagshipObj = flagship.toObject();

    if (flagship.images && flagship.images.length > 0) {
      const imageUrls = await Promise.all(
        flagship.images.map(async (imageKey) => {
          try {
            return await this.storageService.getSignedUrl(imageKey);
          } catch (error) {
            // Avoid hard-failing if signing fails (e.g., missing AWS creds).
            console.error('Failed to sign image URL', { imageKey, error });
            return imageKey;
          }
        }),
      );
      flagshipObj.images = imageUrls;
    }

    return flagshipObj;
  }
}
