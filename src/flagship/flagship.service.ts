import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  async getAllFlagships(filterDto: FlagshipFilterDto): Promise<Flagship[]> {
    const query: any = {};

    const buildStringQuery = (value: string) => ({
      $regex: new RegExp(value, 'i'),
    });

    for (const key of Object.keys(filterDto)) {
      const value = filterDto[key];
      if (value !== undefined) {
        if (typeof value === 'string') {
          query[key] = buildStringQuery(value);
        } else if (typeof value === 'object' && value !== null) {
          query[key] = value;
        } else {
          query[key] = value;
        }
      }
    }

    const flagships = await this.flagshipModel
      .find(query)
      .sort({ createdAt: -1 })
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

  async findOne(id: string): Promise<Flagship> {
    const flagship = await this.flagshipModel.findById(id).exec();
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
  async findRegisteredUsers(id: string, search: string) {
    const searchCriteria = search
      ? { fullName: { $regex: search, $options: 'i' } }
      : {};

    const registrations = await this.registerationModel
      .find({ flagship: id })
      .populate({
        path: 'user',
        model: 'User',
        match: {
          ...searchCriteria,
          'verification.status': VerificationStatus.VERIFIED,
        },
      })
      .exec();

    const filteredRegistrations = registrations.filter(
      (registration) => registration.user !== null,
    );

    return filteredRegistrations;
  }

  async findPendingVerificationUsers(id: string) {
    const verificationStatuses = ['pending'];

    const registrations = await this.registerationModel
      .find({ flagship: id })
      .populate({
        path: 'user',
        model: 'User',
        match: { 'verification.status': { $in: verificationStatuses } },
      })
      .exec();

    const filteredRegistrations = registrations.filter(
      (registration) => registration.user !== null,
    );

    return filteredRegistrations;
  }

  async findPaidUsers(id: string, paymentType: string) {
    const registrations = await this.registerationModel
      .find({ flagship: id })
      .populate({ path: 'user', model: 'User' })
      .populate({
        path: 'paymentId',
        model: 'Payment',
        match: { status: 'approved' },
      })
      .exec();

    // JS-level filtering
    const filtered = registrations.filter(
      (r) => r.payment && r.payment.paymentType === paymentType,
    );

    return filtered;
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

  async getRegisterationStats(id: string) {
    const flagship = await this.flagshipModel.findById(id);
    if (!flagship) {
      throw new NotFoundException(`Flagship with ID ${id} not found`);
    }

    // Get all registrations for this flagship
    const registrations = await this.registerationModel
      .find({ flagship: id })
      .populate({ path: 'user', model: 'User' })
      .populate({
        path: 'paymentId',
        model: 'Payment',
        match: { status: 'approved' },
      })
      .exec();

    // Get all registrations for all flagships to check if users are returning
    const allRegistrations = await this.registerationModel
      .find({ flagship: { $ne: id } })
      .populate({ path: 'user', model: 'User' })
      .exec();

    // Create a set of user IDs who have registered for other flagships
    const returningUserIds = new Set(
      allRegistrations.map((reg) => reg.user?._id.toString()),
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

    const pendingCount = registrations.filter(
      (reg) => reg.status === 'pending',
    ).length;
    const acceptedCount = registrations.filter(
      (reg) => reg.status === 'confirmed',
    ).length;
    const rejectedCount = registrations.filter(
      (reg) => reg.status === 'rejected',
    ).length;
    const paidCount = registrations.filter(
      (reg) => reg.payment !== null,
    ).length;

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
    const updatedRegistration = await this.registerationModel.findByIdAndUpdate(
      id,
      {
        status: 'accepted',
        comment: comment,
      },
      { new: true },
    );

    if (!updatedRegistration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }

    return updatedRegistration;
  }

  async rejectRegisteration(id: string, comment: string) {
    const updatedRegistration = await this.registerationModel.findByIdAndUpdate(
      id,
      {
        status: 'rejected',
        comment: comment,
      },
      { new: true },
    );

    if (!updatedRegistration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }

    return updatedRegistration;
  }

  async didntPickRegistration(id: string, comment: string) {
    const updatedRegistration = await this.registerationModel.findByIdAndUpdate(
      id,
      {
        status: 'didntPick',
        comment: comment,
      },
      { new: true },
    );

    if (!updatedRegistration) {
      throw new NotFoundException(`Registration with ID ${id} not found`);
    }

    return updatedRegistration;
  }

  async verifyUser(id: string, comment: string) { }

  async rejectVerification(id: string, comment: string) { }

  async getPastTrips() {
    const currentDate = new Date();
    const pastTrips = await this.flagshipModel
      .find({
        endDate: { $lt: currentDate },
      })
      .exec();

    const processedFlagships = await Promise.all(
      pastTrips.map(async (flagship) => this.attachSignedImages(flagship)),
    );

    return processedFlagships;
  }

  async getLiveTrips() {
    const liveTrips = await this.flagshipModel.find({
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    });

    const processedFlagships = await Promise.all(
      liveTrips.map(async (flagship) => this.attachSignedImages(flagship)),
    );

    return processedFlagships;
  }

  async getUpcomingTrips() {
    const upcomingTrips = await this.flagshipModel.find({
      startDate: { $gt: new Date() },
    });

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
