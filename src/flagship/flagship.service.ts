import {
  BadRequestException,
  ConflictException,
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
import { MUSAFIR_DISCOUNT_MAX } from 'src/discounts/musafir.constants';

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

  private generateContentVersion(): string {
    return new Types.ObjectId().toHexString();
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

  private normalizeDiscountInput(
    incoming: any,
    existing: any,
    typeKey: 'soloFemale' | 'group' | 'musafir',
  ) {
    const raw = incoming?.[typeKey] || {};
    const prev = existing?.[typeKey] || {};
    const enabled = raw?.enabled !== undefined ? Boolean(raw.enabled) : Boolean(prev.enabled);
    const legacyAmount =
      typeKey === 'group'
        ? raw?.amount ?? raw?.value ?? prev?.amount ?? prev?.value
        : typeKey === 'musafir'
          ? raw?.amount ?? raw?.budget ?? prev?.amount ?? prev?.budget
          : raw?.amount ?? prev?.amount;
    const amount =
      typeKey === 'musafir'
        ? MUSAFIR_DISCOUNT_MAX
        : this.parseAmount(legacyAmount);
    const count = this.parseCount(raw?.count ?? prev?.count);
    const usedValue = typeof prev?.usedValue === 'number' ? prev.usedValue : 0;
    const usedCount = typeof prev?.usedCount === 'number' ? prev.usedCount : 0;

    if (amount < 0 || count < 0) {
      throw new BadRequestException('Discount values cannot be negative.');
    }
    if (enabled && (amount <= 0 || count <= 0)) {
      throw new BadRequestException('Enabled discounts must have positive amount and count.');
    }
    const totalValue = amount * count;
    if (usedValue > totalValue || usedCount > count) {
      throw new BadRequestException('Discount totals cannot be below already used values.');
    }

    return {
      enabled,
      amount: String(amount),
      count: String(count),
      usedValue,
      usedCount,
    };
  }

  private buildNormalizedDiscounts(incomingDiscounts: any, existingDiscounts: any) {
    const solo = this.normalizeDiscountInput(incomingDiscounts, existingDiscounts, 'soloFemale');
    const group = this.normalizeDiscountInput(incomingDiscounts, existingDiscounts, 'group');
    const musafir = this.normalizeDiscountInput(incomingDiscounts, existingDiscounts, 'musafir');

    const totalValue =
      (solo.enabled ? Number(solo.amount) * Number(solo.count) : 0) +
      (group.enabled ? Number(group.amount) * Number(group.count) : 0) +
      (musafir.enabled ? Number(musafir.amount) * Number(musafir.count) : 0);

    return {
      totalDiscountsValue: String(Math.max(0, Math.floor(totalValue))),
      partialTeam: incomingDiscounts?.partialTeam ?? existingDiscounts?.partialTeam,
      soloFemale: solo,
      group: {
        ...group,
        value: incomingDiscounts?.group?.value ?? existingDiscounts?.group?.value,
      },
      musafir: {
        ...musafir,
        budget: incomingDiscounts?.musafir?.budget ?? existingDiscounts?.musafir?.budget,
      },
    };
  }

  private isGroupedTripType(tripType?: string) {
    return tripType === 'group' || tripType === 'partner';
  }

  private mergeLinkedContacts(
    registrations: Array<{ linkedContacts?: any[] }>,
  ): any[] {
    const priority: Record<string, number> = {
      conflict: 3,
      pending: 2,
      invited: 1,
      linked: 0,
    };
    const byEmail = new Map<string, any>();
    registrations.forEach((registration) => {
      (registration?.linkedContacts || []).forEach((contact: any) => {
        const email = (contact.email || '').toLowerCase();
        if (!email) return;
        const existing = byEmail.get(email);
        if (!existing) {
          byEmail.set(email, { ...contact, email });
          return;
        }
        const existingPriority = priority[existing.status] ?? 0;
        const nextPriority = priority[contact.status] ?? 0;
        if (nextPriority > existingPriority) {
          byEmail.set(email, { ...contact, email });
        }
      });
    });
    return Array.from(byEmail.values());
  }

  private deriveAllLinked(contacts: any[]): boolean {
    return !contacts.some((contact) => contact.status !== 'linked');
  }

  private buildDiscountAnalytics(raw: any) {
    const enabled = Boolean(raw?.enabled);
    const amount = this.parseAmount(raw?.amount ?? raw?.value ?? raw?.budget);
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

  async getDiscountAnalytics(flagshipId: string) {
    if (!flagshipId) {
      throw new BadRequestException('Flagship ID is required.');
    }
    const flagship = await this.flagshipModel
      .findById(flagshipId)
      .select('discounts')
      .lean()
      .exec();
    if (!flagship) {
      throw new NotFoundException('Flagship not found.');
    }
    const discounts = (flagship as any)?.discounts || {};
    const solo = this.buildDiscountAnalytics(discounts?.soloFemale);
    const group = this.buildDiscountAnalytics(discounts?.group);
    const musafir = this.buildDiscountAnalytics(discounts?.musafir);
    const totalValue =
      (solo.enabled ? solo.totalValue : 0) +
      (group.enabled ? group.totalValue : 0) +
      (musafir.enabled ? musafir.totalValue : 0);
    return {
      totalDiscountsValue: discounts?.totalDiscountsValue || String(totalValue),
      soloFemale: solo,
      group,
      musafir,
    };
  }

  async getGroupAnalytics(flagshipId: string) {
    if (!flagshipId) {
      throw new BadRequestException('Flagship ID is required.');
    }
    const registrations = await this.registerationModel
      .find({
        flagship: flagshipId,
        cancelledAt: { $exists: false },
        refundStatus: { $ne: 'refunded' },
      })
      .select('groupId tripType linkedContacts')
      .lean()
      .exec();

    const grouped = registrations.filter(
      (reg: any) => this.isGroupedTripType(reg?.tripType) && reg?.groupId,
    );

    const contactStats = {
      total: 0,
      linked: 0,
      pending: 0,
      invited: 0,
      conflict: 0,
    };
    const groups = new Map<string, any[]>();

    grouped.forEach((reg: any) => {
      const groupId = String(reg.groupId);
      if (!groups.has(groupId)) groups.set(groupId, []);
      groups.get(groupId)!.push(reg);

      (reg.linkedContacts || []).forEach((contact: any) => {
        contactStats.total += 1;
        switch (contact.status) {
          case 'linked':
            contactStats.linked += 1;
            break;
          case 'pending':
            contactStats.pending += 1;
            break;
          case 'invited':
            contactStats.invited += 1;
            break;
          case 'conflict':
            contactStats.conflict += 1;
            break;
          default:
            break;
        }
      });
    });

    let allLinkedGroups = 0;
    for (const [, regs] of groups) {
      const merged = this.mergeLinkedContacts(regs);
      if (this.deriveAllLinked(merged)) {
        allLinkedGroups += 1;
      }
    }

    return {
      totalGroups: groups.size,
      groupedRegistrations: grouped.length,
      allLinkedGroups,
      completionRate: groups.size ? allLinkedGroups / groups.size : 0,
      contacts: contactStats,
    };
  }

  async getGroupConflicts(flagshipId: string) {
    if (!flagshipId) {
      throw new BadRequestException('Flagship ID is required.');
    }
    const registrations = await this.registerationModel
      .find({
        flagship: flagshipId,
        cancelledAt: { $exists: false },
        refundStatus: { $ne: 'refunded' },
      })
      .select('_id groupId tripType linkedContacts')
      .lean()
      .exec();

    const emailMap = new Map<string, { email: string; entries: any[]; groupIds: Set<string>; hasConflict: boolean }>();
    registrations.forEach((reg: any) => {
      if (!this.isGroupedTripType(reg?.tripType) || !reg?.groupId) return;
      const groupId = String(reg.groupId);
      (reg.linkedContacts || []).forEach((contact: any) => {
        const email = (contact.email || '').toLowerCase();
        if (!email) return;
        const entry = emailMap.get(email) || {
          email,
          entries: [],
          groupIds: new Set<string>(),
          hasConflict: false,
        };
        entry.entries.push({
          registrationId: String(reg._id),
          groupId,
          status: contact.status,
        });
        entry.groupIds.add(groupId);
        if (contact.status === 'conflict') {
          entry.hasConflict = true;
        }
        emailMap.set(email, entry);
      });
    });

    const conflicts = Array.from(emailMap.values())
      .filter((entry) => entry.groupIds.size > 1 || entry.hasConflict)
      .map((entry) => ({
        email: entry.email,
        entries: entry.entries,
        groupIds: Array.from(entry.groupIds),
        hasConflict: entry.hasConflict,
      }));

    return {
      total: conflicts.length,
      conflicts,
    };
  }

  async reconcileGroupLinks(flagshipId: string) {
    if (!flagshipId) {
      throw new BadRequestException('Flagship ID is required.');
    }
    const registrations = await this.registerationModel
      .find({
        flagship: flagshipId,
        cancelledAt: { $exists: false },
        refundStatus: { $ne: 'refunded' },
        linkedContacts: { $exists: true, $ne: [] },
      })
      .select('_id userId linkedContacts')
      .lean()
      .exec();

    if (!registrations.length) {
      return { updated: 0, linked: 0 };
    }

    const userIds = registrations
      .map((reg: any) => reg.userId)
      .filter(Boolean)
      .map((id: any) => String(id));

    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select('_id email')
      .lean()
      .exec();

    const emailByUserId = new Map<string, string>();
    users.forEach((user: any) => {
      if (user?.email) {
        emailByUserId.set(String(user._id), String(user.email).toLowerCase());
      }
    });

    const registrationByEmail = new Map<string, { registrationId: string; userId: string }>();
    registrations.forEach((reg: any) => {
      const email = emailByUserId.get(String(reg.userId));
      if (email) {
        registrationByEmail.set(email, {
          registrationId: String(reg._id),
          userId: String(reg.userId),
        });
      }
    });

    let updated = 0;
    let linked = 0;
    const now = new Date();

    for (const reg of registrations) {
      let changed = false;
      const inviterEmail = emailByUserId.get(String(reg.userId));
      const nextContacts = (reg.linkedContacts || []).map((contact: any) => {
        const email = (contact.email || '').toLowerCase();
        const match = registrationByEmail.get(email);
        if (!match || contact.status === 'linked' || contact.status === 'conflict') {
          return contact;
        }
        linked += 1;
        changed = true;
        return {
          ...contact,
          status: 'linked',
          registrationId: match.registrationId,
          userId: match.userId,
          linkedAt: now,
        };
      });

      if (changed) {
        updated += 1;
        await this.registerationModel.updateOne(
          { _id: reg._id },
          { $set: { linkedContacts: nextContacts } },
        );
      }

      if (inviterEmail) {
        for (const contact of nextContacts) {
          if (contact.status !== 'linked') continue;
          const targetRegistrationId = contact.registrationId;
          if (!targetRegistrationId) continue;
          const updateResult = await this.registerationModel.updateOne(
            { _id: targetRegistrationId, 'linkedContacts.email': inviterEmail },
            {
              $set: {
                'linkedContacts.$.status': 'linked',
                'linkedContacts.$.registrationId': String(reg._id),
                'linkedContacts.$.userId': String(reg.userId),
                'linkedContacts.$.linkedAt': now,
              },
            },
          );
          if (!(updateResult as any)?.modifiedCount) {
            await this.registerationModel.updateOne(
              { _id: targetRegistrationId },
              {
                $push: {
                  linkedContacts: {
                    email: inviterEmail,
                    status: 'linked',
                    registrationId: String(reg._id),
                    userId: String(reg.userId),
                    linkedAt: now,
                  },
                },
              },
            );
          }
        }
      }
    }

    return { updated, linked };
  }

  private async ensureContentVersion(flagship: Flagship): Promise<string | undefined> {
    if (!flagship) return undefined;
    if (flagship.contentVersion) return flagship.contentVersion;
    const nextVersion = this.generateContentVersion();
    await this.flagshipModel.updateOne(
      {
        _id: (flagship as any)._id,
        $or: [
          { contentVersion: { $exists: false } },
          { contentVersion: null },
          { contentVersion: '' },
        ],
      },
      { $set: { contentVersion: nextVersion } },
    );
    (flagship as any).contentVersion = nextVersion;
    return nextVersion;
  }

  async create(createFlagshipDto: CreateFlagshipDto): Promise<Flagship> {
    const startDate = dayjs(createFlagshipDto.startDate);
    const endDate = dayjs(createFlagshipDto.endDate);
    const diffDays = endDate.diff(startDate, 'day');
    createFlagshipDto.days = diffDays;
    if ((createFlagshipDto as any)?.discounts) {
      (createFlagshipDto as any).discounts = this.buildNormalizedDiscounts(
        (createFlagshipDto as any).discounts,
        {},
      );
    }
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

    await this.ensureContentVersion(flagship);

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

  private async notifyFlagshipUpdated(flagship: Flagship) {
    try {
      const userIds = await this.registerationModel.distinct('userId', {
        flagship: flagship['_id'],
      });
      if (!Array.isArray(userIds) || userIds.length === 0) return;
      const recipientIds = userIds.map((id) => id.toString());

      await this.notificationService.createForUsers(recipientIds, {
        title: 'Trip Updated',
        message: `${flagship.tripName} has been updated. Tap to view the latest details.`,
        type: 'flagship',
        link: `/flagship/details?id=${flagship['_id']}`,
        metadata: { flagshipId: flagship['_id'] },
      });
    } catch (error) {
      console.log('Failed to send flagship update notifications', error?.message || error);
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
    const silentUpdate = (() => {
      const raw = (updateDto as any)?.silentUpdate;
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0' || normalized === '') return false;
      }
      return value === true;
    })();
    const existingFlagship = await this.flagshipModel.findById(id).exec();
    if (!existingFlagship) {
      throw new NotFoundException('Flagship not found');
    }
    const rawContentVersion = (updateDto as any)?.contentVersion;
    const incomingContentVersion = Array.isArray(rawContentVersion)
      ? rawContentVersion[0]
      : rawContentVersion;
    const normalizedContentVersion =
      typeof incomingContentVersion === 'string'
        ? incomingContentVersion.trim()
        : undefined;
    if (
      normalizedContentVersion &&
      existingFlagship.contentVersion &&
      normalizedContentVersion !== existingFlagship.contentVersion
    ) {
      throw new ConflictException('Flagship was updated by another user. Please refresh.');
    }
    const allowedFields: (keyof UpdateFlagshipDto)[] = [
      'tripName',
      'category',
      'destination',
      'startDate',
      'endDate',
      'totalSeats',
      'femaleSeats',
      'maleSeats',
      'citySeats',
      'bedSeats',
      'mattressSeats',
      'genderSplitEnabled',
      'citySplitEnabled',
      'mattressSplitEnabled',
      'mattressPriceDelta',
      'roomSharingPreference',
      'tocs',
      'travelPlan',
      'locations',
      'basePrice',
      'earlyBirdPrice',
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

    if (updateData.discounts !== undefined) {
      const incomingDiscounts = updateData.discounts as any;
      const existingDiscounts = (existingFlagship as any)?.discounts || {};
      updateData.discounts = this.buildNormalizedDiscounts(
        incomingDiscounts,
        existingDiscounts,
      ) as any;
    }

    const rawRemoveImages = (updateDto as any)?.removeImages;
    let removeImages: string[] = [];
    if (Array.isArray(rawRemoveImages)) {
      removeImages = rawRemoveImages;
    } else if (typeof rawRemoveImages === 'string') {
      try {
        const parsed = JSON.parse(rawRemoveImages);
        if (Array.isArray(parsed)) {
          removeImages = parsed;
        }
      } catch {
        // ignore
      }
    }
    removeImages = removeImages.filter((key) => typeof key === 'string' && key.trim());
    let imageKeys: string[] | null = null;
    if (removeImages.length > 0) {
      imageKeys = (existingFlagship.images || []).filter(
        (key) => !removeImages.includes(key),
      );
      updateData['images'] = imageKeys;
      removeImages.forEach((key) => {
        this.storageService.deleteFile(key).catch(() => null);
      });
    }

    if (updateDto.files && updateDto.files.length > 0) {
      try {
        const baseImages = imageKeys ? [...imageKeys] : [...(existingFlagship.images || [])];
        imageKeys = baseImages;

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

    const rawRemoveDetailedPlan = (updateDto as any)?.removeDetailedPlan;
    const removeDetailedPlan =
      rawRemoveDetailedPlan === true || rawRemoveDetailedPlan === 'true';

    if (updateDto.detailedPlanDoc) {
      const previousPlan = existingFlagship.detailedPlan;
      const detailedPlanKey = `flagship/${id}/detailed-plan-${Date.now()}-${updateDto.detailedPlanDoc.originalname}`;
      await this.storageService.uploadFile(
        detailedPlanKey,
        updateDto.detailedPlanDoc.buffer,
        updateDto.detailedPlanDoc.mimetype || 'application/octet-stream',
      );
      updateData['detailedPlan'] = detailedPlanKey;
      if (previousPlan) {
        this.storageService.deleteFile(previousPlan).catch(() => null);
      }
    } else if (removeDetailedPlan) {
      const previousPlan = existingFlagship.detailedPlan;
      updateData['detailedPlan'] = null as any;
      if (previousPlan) {
        this.storageService.deleteFile(previousPlan).catch(() => null);
      }
    }

    const normalizeValue = (value: any) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    };
    const existingValue = existingFlagship.toObject();
    const changedKeys = Object.keys(updateData).filter((key) => {
      const prev = normalizeValue((existingValue as any)[key]);
      const next = normalizeValue((updateData as any)[key]);
      return JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null);
    });
    const shouldBumpContentVersion = changedKeys.length > 0;
    if (!existingFlagship.contentVersion || shouldBumpContentVersion) {
      updateData['contentVersion'] = this.generateContentVersion();
    }

    const updatedFlagship = await this.flagshipModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!updatedFlagship) {
      throw new NotFoundException('Flagship not found');
    }
    const visibilityOnly =
      changedKeys.length > 0 && changedKeys.every((key) => key === 'visibility');
    const nextStatus = updateData.status ?? existingFlagship.status;
    const nextPublish = updateData.publish ?? existingFlagship.publish;
    const wasPublished =
      existingFlagship.status === 'published' || existingFlagship.publish === true;
    const isPublishedNow = nextStatus === 'published' || nextPublish === true;
    const shouldNotify =
      !silentUpdate && !visibilityOnly && changedKeys.length > 0 && (wasPublished || isPublishedNow);
    if (shouldNotify) {
      void this.notifyFlagshipUpdated(updatedFlagship);
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
      status: { $in: ['payment', 'onboarding', 'new', 'confirmed'] },
      isPaid: { $ne: true },
      amountDue: { $gt: 0 },
      latestPaymentStatus: { $ne: 'pendingApproval' },
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

  async gePaymentStats(id: string) {
    const flagship = await this.flagshipModel.findById(id).lean();
    if (!flagship) {
      throw new NotFoundException(`Flagship with ID ${id} not found`);
    }

    const registrations = await this.registerationModel
      .find({ flagship: id, cancelledAt: { $exists: false } })
      .select('userGender joiningFromCity amountDue walletPaid discountApplied discountType status')
      .lean()
      .exec();

    const startDate = flagship.startDate ? new Date(flagship.startDate) : null;
    const today = new Date();
    const daysUntilStart = startDate
      ? Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const totalSeats = this.parseCount(flagship.totalSeats);
    const seatsFilled = registrations.length;

    const maleSeats = registrations.filter((reg) => reg.userGender === 'male').length;
    const femaleSeats = registrations.filter((reg) => reg.userGender === 'female').length;

    const cityCounts = {
      islamabad: 0,
      lahore: 0,
      karachi: 0,
      other: 0,
    };

    registrations.forEach((reg) => {
      const city = (reg.joiningFromCity || '').toLowerCase();
      if (city.includes('islamabad')) cityCounts.islamabad += 1;
      else if (city.includes('lahore')) cityCounts.lahore += 1;
      else if (city.includes('karachi')) cityCounts.karachi += 1;
      else if (city) cityCounts.other += 1;
    });

    const totalDue = registrations.reduce(
      (sum, reg: any) => sum + this.parseAmount(reg.amountDue),
      0,
    );
    const walletPaid = registrations.reduce(
      (sum, reg: any) => sum + this.parseAmount(reg.walletPaid),
      0,
    );

    const registrationIds = registrations.map((reg: any) => reg._id);
    const paymentStatusTotals = {
      approved: 0,
      pendingApproval: 0,
      rejected: 0,
    };
    const paymentMethodTotals = {
      bank_transfer: 0,
      wallet_only: 0,
      wallet_plus_bank: 0,
      cash: 0,
      split_cash_bank: 0,
      partial_cash: 0,
    };

    let totalPaid = walletPaid;

    if (registrationIds.length > 0) {
      const statusAgg = await this.paymentModel.aggregate([
        { $match: { registration: { $in: registrationIds } } },
        {
          $group: {
            _id: '$status',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]);

      statusAgg.forEach((row: any) => {
        const status = String(row._id || '');
        const amount = this.parseAmount(row.totalAmount);
        const count = this.parseCount(row.count);
        if (status in paymentStatusTotals) {
          paymentStatusTotals[status as keyof typeof paymentStatusTotals] = count;
        }
        if (status === 'approved') {
          totalPaid += amount;
        }
      });

      const methodAgg = await this.paymentModel.aggregate([
        {
          $match: {
            registration: { $in: registrationIds },
            status: 'approved',
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$paymentMethod', 'bank_transfer'] },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]);

      methodAgg.forEach((row: any) => {
        const method = String(row._id || 'bank_transfer');
        if (method in paymentMethodTotals) {
          paymentMethodTotals[method as keyof typeof paymentMethodTotals] += this.parseAmount(
            row.totalAmount,
          );
        }
      });
    }

    const discountTotals = {
      soloFemale: 0,
      group: 0,
      musafir: 0,
    };
    registrations.forEach((reg: any) => {
      const amount = this.parseAmount(reg.discountApplied);
      if (!amount) return;
      const type = reg.discountType;
      if (type && type in discountTotals) {
        discountTotals[type as keyof typeof discountTotals] += amount;
      }
    });

    const totalTarget = totalPaid + totalDue;

    return {
      daysUntilStart,
      totalSeats,
      seatsFilled,
      maleSeats,
      femaleSeats,
      cityCounts,
      totalPaid,
      totalDue,
      totalTarget,
      paymentMethodTotals,
      paymentStatusTotals,
      discountTotals,
    };
  }

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

  async getPastTrips(options?: { page?: number; limit?: number; signImages?: boolean }) {
    const currentDate = new Date();
    const filter = { endDate: { $lt: currentDate } };
    const pageRaw = Number(options?.page);
    const limitRaw = Number(options?.limit);
    const shouldSignImages = options?.signImages !== false;
    const shouldPaginate =
      (Number.isFinite(pageRaw) && pageRaw > 0) ||
      (Number.isFinite(limitRaw) && limitRaw > 0);

    if (!shouldPaginate) {
      const pastTrips = await this.flagshipModel
        .find(filter)
        .sort({ endDate: -1 })
        .exec();

      const processedFlagships = shouldSignImages
        ? await Promise.all(
          pastTrips.map(async (flagship) => this.attachSignedImages(flagship)),
        )
        : pastTrips.map((flagship) => flagship.toObject());

      return processedFlagships;
    }

    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 20));
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1);
    const skip = (page - 1) * limit;

    const [total, trips] = await Promise.all([
      this.flagshipModel.countDocuments(filter).exec(),
      this.flagshipModel
        .find(filter)
        .sort({ endDate: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const processedFlagships = shouldSignImages
      ? await Promise.all(
        trips.map(async (flagship) => this.attachSignedImages(flagship)),
      )
      : trips.map((flagship) => flagship.toObject());

    return {
      trips: processedFlagships,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getLiveTrips(options?: { page?: number; limit?: number; signImages?: boolean }) {
    const filter = {
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    };
    const pageRaw = Number(options?.page);
    const limitRaw = Number(options?.limit);
    const shouldSignImages = options?.signImages !== false;
    const shouldPaginate =
      (Number.isFinite(pageRaw) && pageRaw > 0) ||
      (Number.isFinite(limitRaw) && limitRaw > 0);

    if (!shouldPaginate) {
      const liveTrips = await this.flagshipModel
        .find(filter)
        .sort({ startDate: 1 });

      const processedFlagships = shouldSignImages
        ? await Promise.all(
          liveTrips.map(async (flagship) => this.attachSignedImages(flagship)),
        )
        : liveTrips.map((flagship) => flagship.toObject());

      return processedFlagships;
    }

    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 20));
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1);
    const skip = (page - 1) * limit;

    const [total, trips] = await Promise.all([
      this.flagshipModel.countDocuments(filter).exec(),
      this.flagshipModel
        .find(filter)
        .sort({ startDate: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const processedFlagships = shouldSignImages
      ? await Promise.all(
        trips.map(async (flagship) => this.attachSignedImages(flagship)),
      )
      : trips.map((flagship) => flagship.toObject());

    return {
      trips: processedFlagships,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUpcomingTrips(options?: { page?: number; limit?: number; signImages?: boolean }) {
    const filter = { startDate: { $gt: new Date() } };
    const pageRaw = Number(options?.page);
    const limitRaw = Number(options?.limit);
    const shouldSignImages = options?.signImages !== false;
    const shouldPaginate =
      (Number.isFinite(pageRaw) && pageRaw > 0) ||
      (Number.isFinite(limitRaw) && limitRaw > 0);

    if (!shouldPaginate) {
      const upcomingTrips = await this.flagshipModel
        .find(filter)
        .sort({ startDate: 1 });

      const processedFlagships = shouldSignImages
        ? await Promise.all(
          upcomingTrips.map(async (flagship) => this.attachSignedImages(flagship)),
        )
        : upcomingTrips.map((flagship) => flagship.toObject());

      return processedFlagships;
    }

    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 20));
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1);
    const skip = (page - 1) * limit;

    const [total, trips] = await Promise.all([
      this.flagshipModel.countDocuments(filter).exec(),
      this.flagshipModel
        .find(filter)
        .sort({ startDate: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const processedFlagships = shouldSignImages
      ? await Promise.all(
        trips.map(async (flagship) => this.attachSignedImages(flagship)),
      )
      : trips.map((flagship) => flagship.toObject());

    return {
      trips: processedFlagships,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
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
