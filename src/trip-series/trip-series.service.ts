import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { optimizeImageToWebp } from 'src/common/image-optimizer';
import { RegistrationStatus } from 'src/constants/registration-status.enum';
import { MailService } from 'src/mail/mail.service';
import { NotificationService } from 'src/notifications/notification.service';
import { StorageService } from 'src/storage/storageService';
import { WalletService } from 'src/wallet/wallet.service';
import { TripSeries } from './interfaces/trip-series.interface';
import { Departure } from './interfaces/departure.interface';
import { TripSeriesReview } from './interfaces/trip-series-review.interface';
import {
  CreateDepartureDto,
  DepartureFilterDto,
  CreateTripSeriesDto,
  CreateTripSeriesReviewDto,
  SubmitTripSeriesReviewDto,
  TripSeriesFilterDto,
  UpdateDepartureDto,
  UpdateTripSeriesReviewDto,
  UpdateTripSeriesDto,
} from './dto/trip-series.dto';

const PUBLIC_DEPARTURE_STATUSES = ['open', 'filling_fast', 'sold_out', 'waitlist'];
const REVIEW_REWARD_AMOUNT = 10;
const REVIEW_REWARD_TYPE = 'trip_series_review_reward';

const REVIEW_QUESTION_CONFIG = [
  {
    id: 'recommendation',
    label: 'How likely are you to recommend this trip to a friend?',
    type: 'scale',
    min: 0,
    max: 10,
  },
  {
    id: 'satisfaction',
    label: 'How satisfied were you with your trip experience?',
    type: 'choice',
    options: {
      very_satisfied: 'Very Satisfied',
      satisfied: 'Satisfied',
      neutral: 'Neutral',
      unsatisfied: 'Unsatisfied',
      very_unsatisfied: 'Very Unsatisfied',
    },
  },
  {
    id: 'driver_experience',
    label: 'How was the bus driver experience?',
    type: 'scale',
    min: 0,
    max: 10,
  },
  {
    id: 'safety',
    label: 'How safe did you feel during the trip?',
    type: 'choice',
    options: {
      very_safe: 'Very Safe',
      safe: 'Safe',
      neutral: 'Neutral',
      concerned: 'Concerned',
      unsafe: 'Unsafe',
    },
  },
  {
    id: 'value_for_money',
    label: 'How did the trip feel for the price you paid?',
    type: 'choice',
    options: {
      excellent: 'Excellent Value',
      good: 'Good Value',
      fair: 'Fair',
      poor: 'Poor Value',
    },
  },
] as const;

const SATISFACTION_RATING_MAP: Record<string, number> = {
  very_satisfied: 5,
  satisfied: 4,
  neutral: 3,
  unsatisfied: 2,
  very_unsatisfied: 1,
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const safeFileName = (value: string) =>
  value
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
const maxDate = (first: Date, second: Date) => (first.getTime() > second.getTime() ? first : second);
const PAKISTAN_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;
const publicDepartureCutoffDate = (reference = new Date()) => {
  const pakistanDate = new Date(reference.getTime() + PAKISTAN_UTC_OFFSET_MS);
  return new Date(
    Date.UTC(
      pakistanDate.getUTCFullYear(),
      pakistanDate.getUTCMonth(),
      pakistanDate.getUTCDate() + 1,
    ) - PAKISTAN_UTC_OFFSET_MS,
  );
};

@Injectable()
export class TripSeriesService {
  private readonly logger = new Logger(TripSeriesService.name);

  constructor(
    @InjectModel('TripSeries') private readonly tripSeriesModel: Model<TripSeries>,
    @InjectModel('Departure') private readonly departureModel: Model<Departure>,
    @InjectModel('TripSeriesReview') private readonly reviewModel: Model<TripSeriesReview>,
    @InjectModel('Flagship') private readonly flagshipModel: Model<any>,
    @InjectModel('Registration') private readonly registrationModel: Model<any>,
    private readonly storageService: StorageService,
    private readonly walletService: WalletService,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
  ) {}

  private generateContentVersion(): string {
    return new Types.ObjectId().toHexString();
  }

  private parseAmount(value: unknown): number {
    if (value === undefined || value === null) return 0;
    const parsed = Number(value.toString().replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async ensureUniqueSlug(title: string, requestedSlug?: string, ignoreId?: string) {
    const base = slugify(requestedSlug || title);
    if (!base) {
      throw new BadRequestException('Trip series slug could not be generated.');
    }

    let candidate = base;
    let counter = 2;
    while (true) {
      const query: any = { slug: candidate };
      if (ignoreId) query._id = { $ne: ignoreId };
      const existing = await this.tripSeriesModel.findOne(query).select('_id').lean().exec();
      if (!existing) return candidate;
      candidate = `${base}-${counter}`;
      counter += 1;
    }
  }

  private mapCategoryForFlagship(category?: string) {
    if (category === 'international') return 'international';
    if (category === 'adventure') return 'adventure';
    if (category === 'student') return 'student';
    if (category === 'detox') return 'detox';
    return 'flagship';
  }

  private mapLegacyCategoryToSeries(category?: string) {
    if (category === 'international') return 'international';
    if (category === 'adventure') return 'adventure';
    if (category === 'student') return 'student';
    if (category === 'detox') return 'detox';
    if (category === 'flagship') return 'local';
    return 'local';
  }

  private mapLegacyFlagshipStatusToDeparture(flagship: any) {
    if (flagship?.status === 'completed') return 'completed';
    if (flagship?.publish || flagship?.status === 'published') return 'open';
    return 'draft';
  }

  private mapDepartureStatusToFlagshipStatus(status?: string) {
    if (status === 'completed') return 'completed';
    if (['open', 'filling_fast', 'sold_out', 'waitlist'].includes(String(status))) {
      return 'published';
    }
    return 'unpublished';
  }

  private getSeriesImageKeys(series: any): string[] {
    if (Array.isArray(series?.images) && series.images.length > 0) return series.images;
    const mediaUrls = [
      ...(Array.isArray(series?.heroMedia) ? series.heroMedia : []),
      ...(Array.isArray(series?.gallery) ? series.gallery : []),
    ]
      .map((item: any) => item?.url)
      .filter(Boolean);
    return mediaUrls;
  }

  private calculateDurations(startDate: Date, endDate: Date) {
    const ms = endDate.getTime() - startDate.getTime();
    const nights = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
    return {
      durationNights: nights,
      durationDays: nights + 1,
    };
  }

  private normalizeCapacity(dto: CreateDepartureDto | UpdateDepartureDto) {
    const totalCapacity = Number(dto.totalCapacity || 0);
    const femaleCapacity =
      dto.femaleCapacity !== undefined
        ? Number(dto.femaleCapacity)
        : totalCapacity > 0
          ? Math.ceil(totalCapacity / 2)
          : 0;
    const maleCapacity =
      dto.maleCapacity !== undefined
        ? Number(dto.maleCapacity)
        : totalCapacity > 0
          ? Math.max(0, totalCapacity - femaleCapacity)
          : 0;

    return {
      totalCapacity,
      femaleCapacity,
      maleCapacity,
    };
  }

  private getAvailability(departure: any) {
    const total = Number(departure?.totalCapacity || 0);
    const confirmed =
      Number(departure?.confirmedFemaleCount || 0) +
      Number(departure?.confirmedMaleCount || 0);
    const available = Math.max(0, total - confirmed);
    return {
      total,
      confirmed,
      available,
      isSoldOut: total > 0 && available <= 0,
    };
  }

  private sanitizePublicDeparture(departure: any) {
    if (!departure) return departure;
    const { whatsappGroupLink, ...publicDeparture } = departure;
    return publicDeparture;
  }

  private isBookableDeparture(departure: any) {
    const availability = this.getAvailability(departure);
    return (
      departure?.visibility === 'public' &&
      ['open', 'filling_fast', 'waitlist'].includes(String(departure?.status)) &&
      new Date(departure?.startDate).getTime() >= publicDepartureCutoffDate().getTime() &&
      (departure?.status === 'waitlist' || availability.available > 0)
    );
  }

  private cheapestActiveDeparture(departures: any[]) {
    return departures.reduce(
      (best, departure) => {
        const earlyBirdActive =
          this.parseAmount(departure.earlyBirdPrice) > 0 &&
          departure.earlyBirdDeadline &&
          new Date(departure.earlyBirdDeadline).getTime() >= Date.now();
        const price = earlyBirdActive
          ? this.parseAmount(departure.earlyBirdPrice)
          : this.parseAmount(departure.basePrice);
        if (!best || (price > 0 && price < best.price)) {
          return { departure, price };
        }
        return best;
      },
      null as null | { departure: any; price: number },
    );
  }

  private async signImageMaybe(value?: string) {
    if (!value || /^https?:\/\//i.test(value) || value.startsWith('/')) return value;
    try {
      return await this.storageService.getSignedUrl(value);
    } catch {
      return value;
    }
  }

  private async attachSignedSeriesMedia(series: any) {
    const obj = typeof series?.toObject === 'function' ? series.toObject() : { ...series };
    if (Array.isArray(obj.images)) {
      obj.images = await Promise.all(obj.images.map((image) => this.signImageMaybe(image)));
    }
    if (Array.isArray(obj.heroMedia)) {
      obj.heroMedia = await Promise.all(
        obj.heroMedia.map(async (item) => ({
          ...item,
          url: await this.signImageMaybe(item?.url),
        })),
      );
    }
    if (Array.isArray(obj.gallery)) {
      obj.gallery = await Promise.all(
        obj.gallery.map(async (item) => ({
          ...item,
          url: await this.signImageMaybe(item?.url),
        })),
      );
    }
    if (Array.isArray(obj.itineraryDays)) {
      obj.itineraryDays = await Promise.all(
        obj.itineraryDays.map(async (item) => ({
          ...item,
          image: await this.signImageMaybe(item?.image),
        })),
      );
    }
    return obj;
  }

  private async uploadSeriesImages(
    files: Express.Multer.File[] = [],
    slug: string,
  ): Promise<string[]> {
    const uploadedKeys: string[] = [];
    for (const file of files) {
      if (!file?.buffer) continue;
      if (file.mimetype && !file.mimetype.startsWith('image/')) {
        throw new BadRequestException(`Only image uploads are supported. ${file.originalname} is not an image.`);
      }
      try {
        const webpBuffer = await optimizeImageToWebp(file.buffer, file);
        const fileKey = `trip-series/${slug}/${Date.now()}-${safeFileName(file.originalname)}.webp`;
        await this.storageService.uploadFile(fileKey, webpBuffer, 'image/webp');
        uploadedKeys.push(fileKey);
      } catch (error) {
        throw new BadRequestException(
          `Failed to upload image ${file.originalname}: ${error?.message || 'Invalid image'}`,
        );
      }
    }
    return uploadedKeys;
  }

  private async uploadReviewMedia(
    files: Express.Multer.File[] = [],
    slug: string,
  ): Promise<Array<{ url: string; type: 'image'; alt?: string }>> {
    const uploaded: Array<{ url: string; type: 'image'; alt?: string }> = [];
    for (const file of files) {
      if (!file?.buffer) continue;
      if (file.mimetype && !file.mimetype.startsWith('image/')) {
        throw new BadRequestException(`Only image uploads are supported. ${file.originalname} is not an image.`);
      }
      try {
        const webpBuffer = await optimizeImageToWebp(file.buffer, file);
        const fileKey = `trip-series/${slug}/reviews/${Date.now()}-${safeFileName(file.originalname)}.webp`;
        await this.storageService.uploadFile(fileKey, webpBuffer, 'image/webp');
        uploaded.push({ url: fileKey, type: 'image', alt: safeFileName(file.originalname) });
      } catch (error) {
        throw new BadRequestException(
          `Failed to upload image ${file.originalname}: ${error?.message || 'Invalid image'}`,
        );
      }
    }
    return uploaded;
  }

  private normalizeReviewAnswers(input: any[] = []) {
    const answerById = new Map<string, any>();
    if (Array.isArray(input)) {
      input.forEach((answer) => {
        const questionId = String(answer?.questionId || answer?.id || '').trim();
        if (questionId) answerById.set(questionId, answer);
      });
    }

    return REVIEW_QUESTION_CONFIG.map((question) => {
      const answer = answerById.get(question.id);
      if (!answer || answer.value === undefined || answer.value === null || answer.value === '') {
        throw new BadRequestException(`Please answer: ${question.label}`);
      }

      if (question.type === 'scale') {
        const value = Number(answer.value);
        if (!Number.isInteger(value) || value < question.min || value > question.max) {
          throw new BadRequestException(`${question.label} must be between ${question.min} and ${question.max}.`);
        }
        return {
          questionId: question.id,
          questionLabel: question.label,
          value,
          valueLabel: String(value),
        };
      }

      const value = String(answer.value);
      const valueLabel = question.options[value];
      if (!valueLabel) {
        throw new BadRequestException(`Please choose a valid answer for: ${question.label}`);
      }
      return {
        questionId: question.id,
        questionLabel: question.label,
        value,
        valueLabel,
      };
    });
  }

  private deriveReviewRating(dto: Partial<SubmitTripSeriesReviewDto>, answers: any[]) {
    const directRating = Number(dto.rating);
    if (Number.isFinite(directRating) && directRating >= 1 && directRating <= 5) {
      return Math.round(directRating);
    }
    const satisfaction = answers.find((answer) => answer.questionId === 'satisfaction');
    return SATISFACTION_RATING_MAP[String(satisfaction?.value || '')] || 3;
  }

  private normalizeWhistleblowing(input: any) {
    if (!input || typeof input !== 'object') return undefined;
    const category = String(input.category || '').trim();
    const message = String(input.message || '').trim();
    if (!category && !message) return undefined;
    return {
      category,
      message,
      contactConsent: Boolean(input.contactConsent),
    };
  }

  private async attachSignedReviewMedia(review: any) {
    if (!review) return review;
    const obj = typeof review?.toObject === 'function' ? review.toObject() : { ...review };
    if (Array.isArray(obj.media)) {
      obj.media = await Promise.all(
        obj.media.map(async (item: any) => ({
          ...item,
          url: await this.signImageMaybe(item?.url || item),
        })),
      );
    }
    return obj;
  }

  private async buildLegacyFlagshipPayload(series: any, departure: any, userId: string) {
    const startDate = new Date(departure.startDate);
    const endDate = new Date(departure.endDate);
    const { durationNights } = this.calculateDurations(startDate, endDate);
    const capacity = this.normalizeCapacity(departure);
    const publicLegacyStatuses = ['open', 'filling_fast', 'sold_out', 'waitlist'];
    const isPubliclyVisible =
      series?.status === 'active' &&
      departure?.visibility === 'public' &&
      publicLegacyStatuses.includes(String(departure.status));
    const locations =
      Array.isArray(departure.departureCities) && departure.departureCities.length > 0
        ? departure.departureCities
        : [{ name: series.destination, price: '0', enabled: true }];

    return {
      tripName: series.title,
      destination: series.destination,
      startDate,
      endDate,
      category: this.mapCategoryForFlagship(series.category),
      visibility: isPubliclyVisible ? 'public' : 'private',
      images: this.getSeriesImageKeys(series),
      created_By: userId,
      days: durationNights,
      status:
        String(departure.status) === 'completed'
          ? 'completed'
          : isPubliclyVisible
            ? this.mapDepartureStatusToFlagshipStatus(departure.status)
            : 'unpublished',
      publish: isPubliclyVisible,
      summary: series.summary || series.overview,
      tripType: Array.isArray(series.tripTypes) ? series.tripTypes[0] : undefined,
      effortLevel: series.effortLevel || series.difficulty,
      vibeScores: series.vibeScores || [],
      itineraryDays:
        Array.isArray(departure.itineraryOverrides) && departure.itineraryOverrides.length > 0
          ? departure.itineraryOverrides
          : series.itineraryDays || [],
      routeWaypoints: series.routeWaypoints || [],
      includedItems:
        Array.isArray(departure.inclusionsOverrides) && departure.inclusionsOverrides.length > 0
          ? departure.inclusionsOverrides
          : series.includedItems || [],
      notIncludedItems: series.notIncludedItems || [],
      optionalActivities: series.optionalActivities || [],
      additionalInfo: series.additionalInfo || [],
      tripFaqs: series.tripFaqs || [],
      basePrice: departure.basePrice,
      earlyBirdPrice: departure.earlyBirdPrice,
      earlyBirdDeadline: departure.earlyBirdDeadline,
      locations,
      tiers: departure.tiers || [],
      mattressTiers: departure.mattressTiers || [],
      roomSharingPreference: departure.roomSharingPreference || [],
      totalSeats: capacity.totalCapacity,
      femaleSeats: capacity.femaleCapacity,
      maleSeats: capacity.maleCapacity,
      citySeats: departure.citySeats,
      bedSeats: departure.bedSeats,
      mattressSeats: departure.mattressSeats,
      genderSplitEnabled: departure.genderSplitEnabled,
      citySplitEnabled: departure.citySplitEnabled,
      mattressSplitEnabled: departure.mattressSplitEnabled,
      mattressPriceDelta: departure.mattressPriceDelta,
      discounts: departure.discounts,
      selectedBank: departure.selectedBank,
      registrationDeadline: departure.registrationDeadline,
      advancePaymentDeadline: departure.advancePaymentDeadline,
    };
  }

  private buildSeriesPayloadFromFlagship(flagship: any, userId: string, status?: string) {
    const startDate = new Date(flagship.startDate);
    const endDate = new Date(flagship.endDate);
    const durations = this.calculateDurations(startDate, endDate);
    const tripTypes = flagship.tripType ? [flagship.tripType] : [];

    return {
      title: flagship.tripName,
      destination: flagship.destination,
      category: this.mapLegacyCategoryToSeries(flagship.category),
      tripTypes,
      mood: tripTypes,
      images: flagship.images || [],
      overview: flagship.summary || flagship.detailedPlan || flagship.travelPlan,
      summary: flagship.summary,
      highlights: [],
      itineraryDays: flagship.itineraryDays || [],
      routeWaypoints: flagship.routeWaypoints || [],
      includedItems: flagship.includedItems || [],
      notIncludedItems: flagship.notIncludedItems || [],
      optionalActivities: flagship.optionalActivities || [],
      additionalInfo: flagship.additionalInfo || [],
      tripFaqs: flagship.tripFaqs || [],
      effortLevel: flagship.effortLevel,
      difficulty: flagship.effortLevel,
      vibeScores: flagship.vibeScores || [],
      durationMin: durations.durationDays,
      durationMax: durations.durationDays,
      estimatedStartingPrice: this.parseAmount(flagship.basePrice),
      status: status || (flagship.visibility === 'public' && (flagship.publish || flagship.status === 'published') ? 'active' : 'hidden'),
      legacyFlagshipIds: [flagship._id],
      createdBy: userId,
    };
  }

  private buildDeparturePayloadFromFlagship(flagship: any, tripSeriesId: string, userId: string) {
    const startDate = new Date(flagship.startDate);
    const endDate = new Date(flagship.endDate);
    const durations = this.calculateDurations(startDate, endDate);
    const totalCapacity = Number(flagship.totalSeats || flagship.seats || 0);
    const femaleCapacity = Number(flagship.femaleSeats || 0);
    const maleCapacity = Number(flagship.maleSeats || 0);

    return {
      tripSeriesId,
      legacyFlagshipId: flagship._id,
      startDate,
      endDate,
      ...durations,
      departureCities: flagship.locations || [],
      basePrice: flagship.basePrice,
      earlyBirdPrice: flagship.earlyBirdPrice,
      earlyBirdDeadline: flagship.earlyBirdDeadline,
      tiers: flagship.tiers || [],
      mattressTiers: flagship.mattressTiers || [],
      roomSharingPreference: flagship.roomSharingPreference || [],
      totalCapacity,
      femaleCapacity,
      maleCapacity,
      confirmedFemaleCount: Number(flagship.confirmedFemaleCount || 0),
      confirmedMaleCount: Number(flagship.confirmedMaleCount || 0),
      waitlistedFemaleCount: Number(flagship.waitlistedFemaleCount || 0),
      waitlistedMaleCount: Number(flagship.waitlistedMaleCount || 0),
      citySeats: flagship.citySeats,
      bedSeats: flagship.bedSeats,
      mattressSeats: flagship.mattressSeats,
      genderSplitEnabled: flagship.genderSplitEnabled,
      citySplitEnabled: flagship.citySplitEnabled,
      mattressSplitEnabled: flagship.mattressSplitEnabled,
      mattressPriceDelta: flagship.mattressPriceDelta,
      discounts: flagship.discounts,
      selectedBank: flagship.selectedBank,
      registrationDeadline: flagship.registrationDeadline,
      advancePaymentDeadline: flagship.advancePaymentDeadline,
      itineraryOverrides: [],
      inclusionsOverrides: [],
      labels: [],
      status: this.mapLegacyFlagshipStatusToDeparture(flagship),
      visibility: flagship.visibility || 'private',
      createdBy: userId,
    };
  }

  private async createLegacyFlagship(series: any, departure: any, userId: string) {
    const payload = await this.buildLegacyFlagshipPayload(series, departure, userId);
    const flagship = new this.flagshipModel(payload);
    return flagship.save();
  }

  private preserveDiscountUsage(nextDiscounts: any, existingDiscounts: any) {
    if (!nextDiscounts || !existingDiscounts) return nextDiscounts;
    const merged = { ...nextDiscounts };
    ['soloFemale', 'group', 'musafir'].forEach((key) => {
      const existingBucket = existingDiscounts?.[key];
      const nextBucket = merged?.[key];
      if (!nextBucket || !existingBucket) return;
      merged[key] = {
        ...nextBucket,
        usedValue: Math.max(Number(nextBucket.usedValue || 0), Number(existingBucket.usedValue || 0)),
        usedCount: Math.max(Number(nextBucket.usedCount || 0), Number(existingBucket.usedCount || 0)),
      };
    });
    return merged;
  }

  private async syncLegacyFlagship(departure: any) {
    if (!departure?.legacyFlagshipId) return;
    const series = await this.tripSeriesModel.findById(departure.tripSeriesId).lean().exec();
    if (!series) return;
    const payload = await this.buildLegacyFlagshipPayload(series, departure, String(departure.createdBy));
    const existingFlagship: any = await this.flagshipModel
      .findById(departure.legacyFlagshipId)
      .select('discounts')
      .lean()
      .exec();
    payload.discounts = this.preserveDiscountUsage(payload.discounts, existingFlagship?.discounts);
    await this.flagshipModel.findByIdAndUpdate(
      departure.legacyFlagshipId,
      { $set: payload },
      { runValidators: true },
    );
  }

  private async attachPublicSummary(series: any) {
    const cutoff = publicDepartureCutoffDate();
    const departures = await this.departureModel
      .find({
        tripSeriesId: series._id,
        visibility: 'public',
        status: { $in: PUBLIC_DEPARTURE_STATUSES },
        startDate: { $gte: cutoff },
      })
      .sort({ startDate: 1 })
      .lean()
      .exec();

    const availableDepartures = departures.filter((departure) => this.isBookableDeparture(departure));
    const cheapest = this.cheapestActiveDeparture(availableDepartures.length ? availableDepartures : departures);
    const nextDeparture = availableDepartures[0] || departures[0] || null;
    const activeDepartureCount = departures.length;
    const availability = nextDeparture ? this.getAvailability(nextDeparture) : null;

    return {
      ...series,
      activeDepartureCount,
      nextDeparture: nextDeparture ? this.sanitizePublicDeparture(nextDeparture) : null,
      nextDepartureAvailability: availability,
      startingFrom: cheapest?.price || series.estimatedStartingPrice || 0,
    };
  }

  async createTripSeries(
    dto: CreateTripSeriesDto,
    userId: string,
    imageFiles: Express.Multer.File[] = [],
    itineraryDayImageFiles: Express.Multer.File[] = [],
  ) {
    const slug = await this.ensureUniqueSlug(dto.title, dto.slug);
    const uploadedImageKeys = await this.uploadSeriesImages(imageFiles, slug);
    const uploadedItineraryImageKeys = await this.uploadSeriesImages(itineraryDayImageFiles, `${slug}/itinerary`);
    const images = [...(dto.images || []), ...uploadedImageKeys].filter(Boolean);
    const existingGallery = Array.isArray(dto.gallery) ? dto.gallery : [];
    const itineraryDays = Array.isArray(dto.itineraryDays) ? [...dto.itineraryDays] : [];
    const itineraryImageIndexes = Array.isArray(dto.itineraryDayImageIndexes)
      ? dto.itineraryDayImageIndexes.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0)
      : [];
    uploadedItineraryImageKeys.forEach((imageKey, uploadIndex) => {
      const dayIndex = itineraryImageIndexes[uploadIndex];
      if (dayIndex === undefined || !itineraryDays[dayIndex]) return;
      itineraryDays[dayIndex] = {
        ...itineraryDays[dayIndex],
        image: imageKey,
      };
    });
    delete (dto as any).itineraryDayImageIndexes;
    const gallery = [
      ...existingGallery,
      ...uploadedImageKeys.map((url, index) => ({
        url,
        title: dto.title,
        alt: `${dto.title} image ${existingGallery.length + index + 1}`,
        type: 'image',
      })),
    ];
    const created = new this.tripSeriesModel({
      ...dto,
      itineraryDays,
      images,
      gallery,
      slug,
      category: dto.category || 'local',
      status: dto.status || 'hidden',
      createdBy: userId,
    });
    const saved = await created.save();
    const enriched = await this.attachPublicSummary(saved.toObject());
    return this.attachSignedSeriesMedia(enriched);
  }

  async updateTripSeries(id: string, dto: UpdateTripSeriesDto) {
    const existing = await this.tripSeriesModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Trip series not found.');
    if (dto.contentVersion && dto.contentVersion !== existing.contentVersion) {
      throw new ConflictException('Trip series was updated by another user. Please refresh.');
    }

    const updateData: any = { ...dto };
    delete updateData.contentVersion;
    if (dto.title || dto.slug) {
      updateData.slug = await this.ensureUniqueSlug(dto.title || existing.title, dto.slug || existing.slug, id);
    }
    updateData.contentVersion = this.generateContentVersion();
    const shouldHideDepartures = ['hidden', 'archived'].includes(String(updateData.status || ''));
    const shouldRestoreDepartures = String(updateData.status || existing.status || '') === 'active';

    if (shouldHideDepartures) {
      await this.departureModel
        .updateMany(
          { tripSeriesId: id, visibility: { $ne: 'private' } },
          {
            $set: {
              visibility: 'private',
              hiddenBySeries: true,
              contentVersion: this.generateContentVersion(),
            },
          },
          { runValidators: true },
        )
        .exec();
    } else if (shouldRestoreDepartures) {
      await this.departureModel
        .updateMany(
          {
            tripSeriesId: id,
            $or: [
              { hiddenBySeries: true },
              {
                hiddenBySeries: { $ne: false },
                visibility: 'private',
                status: { $in: PUBLIC_DEPARTURE_STATUSES },
              },
            ],
          },
          {
            $set: {
              visibility: 'public',
              hiddenBySeries: false,
              contentVersion: this.generateContentVersion(),
            },
          },
          { runValidators: true },
        )
        .exec();
    }

    const updated = await this.tripSeriesModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
      .exec();
    const departures = await this.departureModel.find({ tripSeriesId: id }).exec();
    await Promise.all(departures.map((departure) => this.syncLegacyFlagship(departure)));
    return this.attachSignedSeriesMedia(updated);
  }

  async getAdminTripSeries() {
    const series = await this.tripSeriesModel.find().sort({ updatedAt: -1 }).lean().exec();
    return Promise.all(series.map((item) => this.attachPublicSummary(item)));
  }

  async getAdminDepartures(window?: 'live' | 'upcoming') {
    const now = new Date();
    const query: any = {};

    if (window === 'live') {
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    } else if (window === 'upcoming') {
      query.startDate = { $gt: now };
    }

    const departures = await this.departureModel
      .find(query)
      .sort({ startDate: 1 })
      .populate('tripSeriesId', 'title slug destination category status images heroMedia gallery')
      .lean()
      .exec();

    return departures.map((departure) => ({
      ...departure,
      availability: this.getAvailability(departure),
    }));
  }

  async migrateLegacyFlagships(
    userId: string,
    options: { flagshipIds?: string[]; status?: 'active' | 'hidden'; limit?: number } = {},
  ) {
    const query: any = {};
    if (Array.isArray(options.flagshipIds) && options.flagshipIds.length > 0) {
      query._id = { $in: options.flagshipIds };
    }

    const limit = Math.max(1, Math.min(500, Number(options.limit || 100)));
    const flagships = await this.flagshipModel
      .find(query)
      .sort({ startDate: 1 })
      .limit(limit)
      .lean()
      .exec();

    const results = {
      inspected: flagships.length,
      seriesCreated: 0,
      seriesReused: 0,
      departuresCreated: 0,
      skippedExistingDepartures: 0,
      skippedInvalidFlagships: 0,
      failed: 0,
      items: [] as Array<{ flagshipId: string; tripSeriesId?: string; departureId?: string; status: string }>,
    };

    for (const flagship of flagships) {
      const flagshipId = String(flagship?._id || '');
      try {
        if (!flagshipId || !flagship?.tripName || !flagship?.destination || !flagship?.startDate || !flagship?.endDate) {
          results.skippedInvalidFlagships += 1;
          results.items.push({ flagshipId, status: 'skipped_invalid' });
          continue;
        }

        const existingDeparture = await this.departureModel
          .findOne({ legacyFlagshipId: flagship._id })
          .select('_id tripSeriesId')
          .lean()
          .exec();

        if (existingDeparture) {
          results.skippedExistingDepartures += 1;
          results.items.push({
            flagshipId,
            tripSeriesId: String(existingDeparture.tripSeriesId),
            departureId: String(existingDeparture._id),
            status: 'skipped_existing_departure',
          });
          continue;
        }

        const baseSlug = slugify(flagship.tripName);
        let series = await this.tripSeriesModel.findOne({ slug: baseSlug }).exec();
        if (series) {
          results.seriesReused += 1;
        } else {
          const seriesPayload = this.buildSeriesPayloadFromFlagship(flagship, userId, options.status);
          series = new this.tripSeriesModel({
            ...seriesPayload,
            slug: await this.ensureUniqueSlug(flagship.tripName, baseSlug),
          });
          await series.save();
          results.seriesCreated += 1;
        }

        const departure = new this.departureModel(
          this.buildDeparturePayloadFromFlagship(flagship, String(series._id), userId),
        );
        const savedDeparture = await departure.save();
        const seriesUpdate: any = {
          $addToSet: { legacyFlagshipIds: flagship._id },
        };
        if (departure.durationDays) {
          seriesUpdate.$min = { durationMin: departure.durationDays };
          seriesUpdate.$max = { durationMax: departure.durationDays };
        }
        await this.tripSeriesModel.findByIdAndUpdate(series._id, seriesUpdate);

        results.departuresCreated += 1;
        results.items.push({
          flagshipId,
          tripSeriesId: String(series._id),
          departureId: String(savedDeparture._id),
          status: 'migrated',
        });
      } catch (error) {
        results.failed += 1;
        results.items.push({ flagshipId, status: 'failed' });
      }
    }

    return results;
  }

  private async hasDepartureInMonth(seriesId: string, month: string) {
    const [year, monthIndex] = month.split('-').map((part) => Number(part));
    if (!year || !monthIndex || monthIndex < 1 || monthIndex > 12) return false;
    const cutoff = publicDepartureCutoffDate();
    const start = new Date(Date.UTC(year, monthIndex - 1, 1));
    const end = new Date(Date.UTC(year, monthIndex, 1));
    return Boolean(await this.departureModel.exists({
      tripSeriesId: seriesId,
      visibility: 'public',
      status: { $in: PUBLIC_DEPARTURE_STATUSES },
      startDate: { $gte: maxDate(start, cutoff), $lt: end },
    }));
  }

  async getPublicTripSeries(filters: TripSeriesFilterDto = {}) {
    const query: any = { status: 'active' };
    if (filters.destination) query.destination = { $regex: new RegExp(escapeRegex(filters.destination), 'i') };
    if (filters.category) query.category = filters.category;
    if (filters.tripType) query.tripTypes = filters.tripType;
    if (filters.mood) query.mood = filters.mood;
    if (filters.difficulty) {
      query.$or = [
        { difficulty: { $regex: new RegExp(escapeRegex(filters.difficulty), 'i') } },
        { effortLevel: { $regex: new RegExp(escapeRegex(filters.difficulty), 'i') } },
      ];
    }

    const series = await this.tripSeriesModel.find(query).sort({ updatedAt: -1 }).lean().exec();
    let enriched = await Promise.all(series.map((item) => this.attachPublicSummary(item)));
    enriched = enriched.filter((item: any) => Number(item.activeDepartureCount || 0) > 0);

    if (filters.budgetMin !== undefined || filters.budgetMax !== undefined) {
      enriched = enriched.filter((item: any) => {
        const price = Number(item.startingFrom || 0);
        if (filters.budgetMin !== undefined && price < Number(filters.budgetMin)) return false;
        if (filters.budgetMax !== undefined && price > Number(filters.budgetMax)) return false;
        return true;
      });
    }

    if (filters.durationMin !== undefined || filters.durationMax !== undefined) {
      enriched = enriched.filter((item: any) => {
        const minDuration = Number(item.durationMin || item.nextDeparture?.durationDays || 0);
        const maxDuration = Number(item.durationMax || item.nextDeparture?.durationDays || minDuration);
        if (filters.durationMin !== undefined && maxDuration < Number(filters.durationMin)) return false;
        if (filters.durationMax !== undefined && minDuration > Number(filters.durationMax)) return false;
        return true;
      });
    }

    if (filters.month) {
      const monthPairs = await Promise.all(
        enriched.map(async (item: any) => ({
          item,
          matches: await this.hasDepartureInMonth(String(item._id), filters.month),
        })),
      );
      enriched = monthPairs.filter((pair) => pair.matches).map((pair) => pair.item);
    }

    return Promise.all(enriched.map((item) => this.attachSignedSeriesMedia(item)));
  }

  async getTripSeriesBySlug(slug: string, options?: { includeHidden?: boolean }) {
    const query: any = { slug };
    if (!options?.includeHidden) query.status = 'active';
    const series = await this.tripSeriesModel.findOne(query).lean().exec();
    if (!series) throw new NotFoundException('Trip series not found.');
    const withSummary = await this.attachPublicSummary(series);
    if (!options?.includeHidden && Number(withSummary.activeDepartureCount || 0) === 0) {
      throw new NotFoundException('Trip series not found.');
    }
    const departures = await this.getDeparturesForSeries(String(series._id), {
      publicOnly: !options?.includeHidden,
    });
    const reviews = await this.getReviewsForSeries(String(series._id), {
      publishedOnly: !options?.includeHidden,
      limit: 12,
    });
    return this.attachSignedSeriesMedia({
      ...withSummary,
      departures,
      reviews,
    });
  }

  async getTripSeriesById(id: string) {
    const series = await this.tripSeriesModel.findById(id).lean().exec();
    if (!series) throw new NotFoundException('Trip series not found.');
    const departures = await this.getDeparturesForSeries(id, { publicOnly: false });
    const reviews = await this.getReviewsForSeries(id, { publishedOnly: false, limit: 50 });
    return this.attachSignedSeriesMedia({
      ...(await this.attachPublicSummary(series)),
      departures,
      reviews,
    });
  }

  async createDeparture(dto: CreateDepartureDto, userId: string) {
    const series = await this.tripSeriesModel.findById(dto.tripSeriesId).lean().exec();
    if (!series) throw new NotFoundException('Trip series not found.');
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Departure dates are invalid.');
    }
    if (startDate >= endDate) {
      throw new BadRequestException('Departure start date must be before end date.');
    }

    const durations = this.calculateDurations(startDate, endDate);
    const capacity = this.normalizeCapacity(dto);
    const departurePayload = {
      ...dto,
      startDate,
      endDate,
      ...durations,
      ...capacity,
      status: dto.status || 'draft',
      visibility: dto.visibility || 'private',
      createdBy: userId,
    };

    const legacyFlagship = await this.createLegacyFlagship(series, departurePayload, userId);
    const departure = new this.departureModel({
      ...departurePayload,
      legacyFlagshipId: legacyFlagship._id,
    });
    const savedDeparture = await departure.save();
    await this.tripSeriesModel.findByIdAndUpdate(dto.tripSeriesId, {
      $addToSet: { legacyFlagshipIds: legacyFlagship._id },
    });
    return savedDeparture;
  }

  async updateDeparture(id: string, dto: UpdateDepartureDto) {
    const existing = await this.departureModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Departure not found.');
    if (dto.contentVersion && dto.contentVersion !== existing.contentVersion) {
      throw new ConflictException('Departure was updated by another user. Please refresh.');
    }

    const updateData: any = { ...dto };
    delete updateData.contentVersion;
    if (dto.visibility) {
      updateData.hiddenBySeries = false;
    }
    if (dto.startDate || dto.endDate) {
      const startDate = new Date(dto.startDate || existing.startDate);
      const endDate = new Date(dto.endDate || existing.endDate);
      if (startDate >= endDate) {
        throw new BadRequestException('Departure start date must be before end date.');
      }
      Object.assign(updateData, this.calculateDurations(startDate, endDate));
    }
    if (
      dto.totalCapacity !== undefined ||
      dto.femaleCapacity !== undefined ||
      dto.maleCapacity !== undefined
    ) {
      Object.assign(updateData, this.normalizeCapacity({ ...(existing.toObject() as any), ...dto }));
    }
    updateData.contentVersion = this.generateContentVersion();

    const updated = await this.departureModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
      .exec();
    await this.syncLegacyFlagship(updated);
    if (String(existing.status) !== 'completed' && String(updated?.status) === 'completed') {
      this.sendReviewInvitationsForDeparture(updated).catch((error) => {
        this.logger.error('Failed to send departure review invitations', error?.stack || error);
      });
    }
    return updated;
  }

  async getDeparturesForSeries(seriesId: string, options?: { publicOnly?: boolean }) {
    const query: any = { tripSeriesId: seriesId };
    if (options?.publicOnly) {
      query.visibility = 'public';
      query.status = { $in: PUBLIC_DEPARTURE_STATUSES };
      query.startDate = { $gte: publicDepartureCutoffDate() };
    }
    const departures = await this.departureModel.find(query).sort({ startDate: 1 }).lean().exec();
    return departures.map((departure) => ({
      ...(options?.publicOnly ? this.sanitizePublicDeparture(departure) : departure),
      availability: this.getAvailability(departure),
    }));
  }

  async getPublicDepartures(filters: DepartureFilterDto = {}) {
    const cutoff = publicDepartureCutoffDate();
    const seriesQuery: any = { status: 'active' };
    if (filters.series) seriesQuery.slug = filters.series;
    if (filters.category) seriesQuery.category = filters.category;
    if (filters.destination) {
      seriesQuery.destination = { $regex: new RegExp(escapeRegex(filters.destination), 'i') };
    }

    const series = await this.tripSeriesModel.find(seriesQuery).select('_id').lean().exec();
    if (!series.length) return [];

    const query: any = {
      tripSeriesId: { $in: series.map((item) => item._id) },
      visibility: 'public',
      status: { $in: filters.status ? [filters.status] : PUBLIC_DEPARTURE_STATUSES },
      startDate: { $gte: cutoff },
    };

    if (filters.month) {
      const [year, monthIndex] = filters.month.split('-').map((part) => Number(part));
      if (year && monthIndex >= 1 && monthIndex <= 12) {
        const monthStart = new Date(Date.UTC(year, monthIndex - 1, 1));
        query.startDate = {
          $gte: maxDate(monthStart, cutoff),
          $lt: new Date(Date.UTC(year, monthIndex, 1)),
        };
      }
    }

    let departures = await this.departureModel
      .find(query)
      .sort({ startDate: 1 })
      .populate('tripSeriesId', 'title slug destination category')
      .lean()
      .exec();

    departures = departures
      .map((departure) => ({
        ...this.sanitizePublicDeparture(departure),
        availability: this.getAvailability(departure),
      }))
      .filter((departure: any) => {
        if (filters.budgetMax !== undefined && this.parseAmount(departure.basePrice) > Number(filters.budgetMax)) {
          return false;
        }
        if (filters.durationMax !== undefined && Number(departure.durationDays || 0) > Number(filters.durationMax)) {
          return false;
        }
        return true;
      });

    return departures;
  }

  async getDeparturesBySlug(slug: string, options?: { publicOnly?: boolean }) {
    const series = await this.tripSeriesModel.findOne({ slug }).select('_id status').lean().exec();
    if (!series || (options?.publicOnly && series.status !== 'active')) {
      throw new NotFoundException('Trip series not found.');
    }
    return this.getDeparturesForSeries(String(series._id), options);
  }

  async getDeparture(id: string, options?: { publicOnly?: boolean }) {
    const query: any = { _id: id };
    if (options?.publicOnly) {
      query.visibility = 'public';
      query.status = { $in: PUBLIC_DEPARTURE_STATUSES };
      query.startDate = { $gte: publicDepartureCutoffDate() };
    }
    const departure = await this.departureModel
      .findOne(query)
      .populate('tripSeriesId')
      .lean()
      .exec();
    if (!departure) throw new NotFoundException('Departure not found.');
    return {
      ...(options?.publicOnly ? this.sanitizePublicDeparture(departure) : departure),
      availability: this.getAvailability(departure),
    };
  }

  async getDepartureGroupAccess(id: string, userId: string) {
    const departure = await this.departureModel
      .findById(id)
      .populate('tripSeriesId', 'title slug destination category')
      .lean()
      .exec();
    if (!departure) throw new NotFoundException('Departure not found.');

    const whatsappGroupLink = String((departure as any).whatsappGroupLink || '').trim();
    if (!whatsappGroupLink) {
      return {
        canAccess: false,
        reason: 'not_available',
      };
    }

    const registrationQuery: any = {
      userId,
      cancelledAt: null,
      status: RegistrationStatus.CONFIRMED,
      seatLocked: true,
      hasApprovedPayment: true,
      $or: [{ departureId: id }],
    };

    if ((departure as any).legacyFlagshipId) {
      registrationQuery.$or.push(
        { flagship: (departure as any).legacyFlagshipId },
        { flagshipId: (departure as any).legacyFlagshipId },
      );
    }

    const registration = await this.registrationModel
      .findOne(registrationQuery)
      .select('_id settlementStatus latestPaymentStatus isPaid')
      .lean()
      .exec();

    if (!registration) {
      return {
        canAccess: false,
        reason: 'payment_required',
      };
    }

    return {
      canAccess: true,
      whatsappGroupLink,
      departure: {
        ...this.sanitizePublicDeparture(departure),
        availability: this.getAvailability(departure),
      },
      registrationId: String((registration as any)._id),
      settlementStatus: (registration as any).settlementStatus,
    };
  }

  async getDepartureByLegacyFlagship(flagshipId: string) {
    if (!flagshipId) return null;
    return this.departureModel.findOne({ legacyFlagshipId: flagshipId }).lean().exec();
  }

  async getTripSeriesByLegacyFlagship(flagshipId: string, options?: { publicOnly?: boolean }) {
    const departure = await this.departureModel
      .findOne({ legacyFlagshipId: flagshipId })
      .populate('tripSeriesId')
      .lean()
      .exec();

    if (!departure || !departure.tripSeriesId) {
      throw new NotFoundException('Trip series not found for this flagship.');
    }
    const series: any = departure.tripSeriesId;
    if (
      options?.publicOnly &&
      (
        series.status !== 'active' ||
        departure.visibility !== 'public' ||
        !PUBLIC_DEPARTURE_STATUSES.includes(String(departure.status)) ||
        new Date(departure.startDate).getTime() < publicDepartureCutoffDate().getTime()
      )
    ) {
      throw new NotFoundException('Trip series not found for this flagship.');
    }

    return {
      series,
      departure: {
        ...this.sanitizePublicDeparture(departure),
        availability: this.getAvailability(departure),
      },
    };
  }

  async getLastMinuteDepartures(days = 21) {
    const windowDays = Math.max(1, Math.min(120, Number(days) || 21));
    const cutoff = publicDepartureCutoffDate();
    const until = new Date(cutoff.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const departures = await this.departureModel
      .find({
        visibility: 'public',
        status: { $in: ['open', 'filling_fast'] },
        startDate: { $gte: cutoff, $lte: until },
      })
      .populate('tripSeriesId')
      .sort({ startDate: 1 })
      .lean()
      .exec();

    return departures
      .map((departure) => ({
        ...this.sanitizePublicDeparture(departure),
        availability: this.getAvailability(departure),
      }))
      .filter((departure: any) => departure.availability.available > 0 && departure.tripSeriesId?.status === 'active');
  }

  private buildRegistrationMatchForDepartures(departures: any[]) {
    const departureIds = departures.map((departure: any) => departure._id).filter(Boolean);
    const legacyFlagshipIds = departures
      .map((departure: any) => departure.legacyFlagshipId)
      .filter(Boolean);
    const registrationMatch: any[] = [];
    if (departureIds.length) registrationMatch.push({ departureId: { $in: departureIds } });
    if (legacyFlagshipIds.length) {
      registrationMatch.push({ flagship: { $in: legacyFlagshipIds } });
      registrationMatch.push({ flagshipId: { $in: legacyFlagshipIds } });
    }
    return registrationMatch;
  }

  private matchRegistrationToDeparture(registration: any, departures: any[]) {
    const registrationDepartureId = registration.departureId ? String(registration.departureId) : '';
    if (registrationDepartureId) {
      const matched = departures.find((departure: any) => String(departure._id) === registrationDepartureId);
      if (matched) return matched;
    }
    return departures.find((departure: any) => {
      const legacyFlagshipId = String(departure.legacyFlagshipId || '');
      return (
        legacyFlagshipId &&
        (legacyFlagshipId === String(registration.flagship || '') ||
          legacyFlagshipId === String(registration.flagshipId || ''))
      );
    });
  }

  private async getReviewCandidatesForSeries(seriesId: string, userId: string) {
    const now = new Date();
    const completedDepartures = await this.departureModel
      .find({
        tripSeriesId: seriesId,
        $or: [
          { status: 'completed' },
          { endDate: { $lt: now } },
        ],
      })
      .select('_id legacyFlagshipId startDate endDate')
      .lean()
      .exec();

    if (!completedDepartures.length) return [];

    const registrationMatch = this.buildRegistrationMatchForDepartures(completedDepartures);
    if (!registrationMatch.length) return [];

    const registrations = await this.registrationModel
      .find({
        userId,
        status: RegistrationStatus.CONFIRMED,
        seatLocked: true,
        $and: [
          {
            $or: [
              { cancelledAt: { $exists: false } },
              { cancelledAt: null },
            ],
          },
          { $or: registrationMatch },
        ],
      })
      .sort({ completedAt: -1, updatedAt: -1 })
      .lean()
      .exec() as any[];

    const seenDepartureIds = new Set<string>();
    const candidates = registrations
      .map((registration) => {
        const departure = this.matchRegistrationToDeparture(registration, completedDepartures);
        const departureId = departure ? String(departure._id) : String(registration.departureId || '');
        if (!departureId || seenDepartureIds.has(departureId)) return null;
        seenDepartureIds.add(departureId);
        return {
          registrationId: String(registration._id),
          departureId,
          departure: departure
            ? {
                _id: String(departure._id),
                startDate: departure.startDate,
                endDate: departure.endDate,
              }
            : undefined,
        };
      })
      .filter(Boolean) as Array<{
        registrationId: string;
        departureId: string;
        departure?: { _id: string; startDate?: Date; endDate?: Date };
      }>;

    if (!candidates.length) return [];

    const reviewedDepartureIds = await this.reviewModel
      .find({
        tripSeriesId: seriesId,
        userId,
        departureId: { $in: candidates.map((candidate) => candidate.departureId) },
      })
      .distinct('departureId')
      .exec();
    const reviewed = new Set(reviewedDepartureIds.map((id: any) => String(id)));
    return candidates.filter((candidate) => !reviewed.has(candidate.departureId));
  }

  private async sendReviewInvitationForRegistration(registration: any, departure: any, series: any) {
    const userId = String(registration.userId || registration.user?._id || '');
    if (!userId || !departure?._id || !series?._id || !series?.slug) return;

    const existingReview = await this.reviewModel
      .findOne({
        tripSeriesId: series._id,
        departureId: departure._id,
        userId,
      })
      .select('_id')
      .lean()
      .exec();
    if (existingReview) return;

    const reviewPath = `/trips/${series.slug}?review=1&departureId=${departure._id}&registrationId=${registration._id}`;
    const message = `Your ${series.title} departure is complete. Share your review and Rs ${REVIEW_REWARD_AMOUNT} will be credited to your wallet.`;

    try {
      await this.notificationService.createForUser(userId, {
        title: 'Share your trip review',
        message,
        type: 'trip_review',
        link: reviewPath,
        metadata: {
          kind: 'trip_series_review_request',
          tripSeriesId: String(series._id),
          departureId: String(departure._id),
          registrationId: String(registration._id),
          rewardAmount: REVIEW_REWARD_AMOUNT,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create review notification', error?.stack || error);
    }

    const email = registration.user?.email;
    if (!email) return;

    try {
      const frontendBase = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
      await this.mailService.sendTripLinkNotificationEmail({
        toEmail: email,
        subject: `Share your review for ${series.title}`,
        headline: 'How was your trip?',
        message,
        actionUrl: frontendBase ? `${frontendBase}${reviewPath}` : reviewPath,
        actionLabel: 'Write review',
      });
    } catch (error) {
      this.logger.error('Failed to send review invitation email', error?.stack || error);
    }
  }

  private async sendReviewInvitationsForDeparture(departure: any) {
    if (!departure?._id || !departure?.tripSeriesId) return;
    const series = await this.tripSeriesModel
      .findById(departure.tripSeriesId)
      .select('_id title slug status')
      .lean()
      .exec() as any;
    if (!series || series.status !== 'active') return;

    const registrationMatch = this.buildRegistrationMatchForDepartures([departure]);
    if (!registrationMatch.length) return;

    const registrations = await this.registrationModel
      .find({
        status: RegistrationStatus.CONFIRMED,
        seatLocked: true,
        $and: [
          {
            $or: [
              { cancelledAt: { $exists: false } },
              { cancelledAt: null },
            ],
          },
          { $or: registrationMatch },
        ],
      })
      .populate('user', 'fullName email')
      .lean()
      .exec() as any[];

    if (!registrations.length) return;
    const now = new Date();
    await this.registrationModel.updateMany(
      {
        _id: { $in: registrations.map((registration) => registration._id) },
        completedAt: { $exists: false },
      },
      { $set: { completedAt: now } },
    );

    for (const registration of registrations) {
      await this.sendReviewInvitationForRegistration(registration, departure, series);
    }
  }

  async sendReviewInvitationsForRegistrations(registrationIds: string[] = []) {
    const cleanIds = registrationIds.filter(Boolean);
    if (!cleanIds.length) return;

    const registrations = await this.registrationModel
      .find({ _id: { $in: cleanIds } })
      .populate('user', 'fullName email')
      .lean()
      .exec() as any[];

    for (const registration of registrations) {
      const departure = registration.departureId
        ? await this.departureModel.findById(registration.departureId).lean().exec()
        : await this.departureModel
            .findOne({
              legacyFlagshipId: registration.flagship || registration.flagshipId,
            })
            .lean()
            .exec();
      if (!departure?.tripSeriesId) continue;

      const series = await this.tripSeriesModel
        .findById(departure.tripSeriesId)
        .select('_id title slug status')
        .lean()
        .exec() as any;
      if (!series || series.status !== 'active') continue;

      await this.sendReviewInvitationForRegistration(registration, departure, series);
    }
  }

  async createReview(dto: CreateTripSeriesReviewDto, userId?: string) {
    const series = await this.tripSeriesModel.findById(dto.tripSeriesId).select('_id').lean().exec();
    if (!series) throw new NotFoundException('Trip series not found.');
    const review = new this.reviewModel({
      ...dto,
      review: dto.review || '',
      userId,
      sourceType: dto.registrationId ? 'registration' : 'manual',
      status: dto.status || 'published',
    });
    let saved: any;
    try {
      saved = await review.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException('You have already reviewed this completed departure.');
      }
      throw error;
    }
    await this.recalculateSeriesRating(dto.tripSeriesId);
    return this.attachSignedReviewMedia(saved);
  }

  async createUserReviewForSeriesSlug(
    slug: string,
    dto: SubmitTripSeriesReviewDto,
    userId: string,
    imageFiles: Express.Multer.File[] = [],
  ) {
    const series = await this.tripSeriesModel
      .findOne({ slug, status: 'active' })
      .select('_id title slug')
      .lean()
      .exec() as any;
    if (!series) throw new NotFoundException('Trip series not found.');

    const answers = this.normalizeReviewAnswers(dto.answers);
    const rating = this.deriveReviewRating(dto, answers);
    const uploadedMedia = await this.uploadReviewMedia(imageFiles, slug);
    const media = [
      ...(Array.isArray(dto.media) ? dto.media : []),
      ...uploadedMedia,
    ].filter((item) => item?.url || typeof item === 'string')
      .map((item) => (typeof item === 'string' ? { url: item, type: 'image' } : item));
    const whistleblowing = this.normalizeWhistleblowing(dto.whistleblowing);

    const { registration, departureId } = await this.getCompletedRegistrationForReview(
      String(series._id),
      dto,
      userId,
    );

    const existingReview = await this.reviewModel
      .findOne({
        tripSeriesId: series._id,
        userId,
        departureId,
      })
      .select('_id')
      .lean()
      .exec();
    if (existingReview) {
      throw new ConflictException('You have already reviewed this completed departure.');
    }

    const saved = await this.createReview(
      {
        tripSeriesId: String(series._id),
        departureId,
        registrationId: String(registration._id),
        rating,
        answers,
        review: dto.review?.trim() || '',
        whistleblowing,
        media,
        status: 'published',
        featured: false,
      },
      userId,
    ) as any;

    try {
      const walletTx = await this.walletService.credit({
        userId,
        amount: REVIEW_REWARD_AMOUNT,
        type: REVIEW_REWARD_TYPE,
        sourceId: String(saved._id),
        sourceType: 'TripSeriesReview',
        note: `Review reward for ${series.title}`,
        metadata: {
          tripSeriesId: String(series._id),
          departureId,
          registrationId: String(registration._id),
          rewardReason: 'trip_series_review',
        },
      });
      const reward = {
        amount: REVIEW_REWARD_AMOUNT,
        currency: 'PKR' as const,
        transactionId: String((walletTx as any)?._id || ''),
        creditedAt: new Date(),
      };
      const updated = await this.reviewModel
        .findByIdAndUpdate(saved._id, { $set: { reward } }, { new: true })
        .populate('userId', 'fullName email city')
        .exec();
      return this.attachSignedReviewMedia(updated || { ...saved, reward });
    } catch (error) {
      this.logger.error('Failed to credit review reward', error?.stack || error);
      return saved;
    }
  }

  async getUserReviewEligibilityForSeriesSlug(slug: string, userId: string) {
    const series = await this.tripSeriesModel
      .findOne({ slug, status: 'active' })
      .select('_id')
      .lean()
      .exec() as any;
    if (!series) throw new NotFoundException('Trip series not found.');

    const candidates = await this.getReviewCandidatesForSeries(String(series._id), userId);
    if (candidates.length > 0) {
      const first = candidates[0];
      return {
        canReview: true,
        reason: null,
        registrationId: first.registrationId,
        departureId: first.departureId,
        eligibleDepartures: candidates,
      };
    }

    const completedDepartures = await this.departureModel
      .find({
        tripSeriesId: series._id,
        $or: [{ status: 'completed' }, { endDate: { $lt: new Date() } }],
      })
      .select('_id legacyFlagshipId')
      .lean()
      .exec();
    const registrationMatch = this.buildRegistrationMatchForDepartures(completedDepartures);
    const hasCompletedRegistration = registrationMatch.length
      ? await this.registrationModel.exists({
          userId,
          status: RegistrationStatus.CONFIRMED,
          seatLocked: true,
          $and: [
            {
              $or: [
                { cancelledAt: { $exists: false } },
                { cancelledAt: null },
              ],
            },
            { $or: registrationMatch },
          ],
        })
      : null;

    return {
      canReview: false,
      reason: hasCompletedRegistration ? 'already_reviewed' : 'not_completed',
    };
  }

  private async getCompletedRegistrationForReview(
    seriesId: string,
    dto: Partial<SubmitTripSeriesReviewDto>,
    userId: string,
  ) {
    const now = new Date();
    const departureQuery: any = {
      tripSeriesId: seriesId,
      $or: [
        { status: 'completed' },
        { endDate: { $lt: now } },
      ],
    };
    if (dto.departureId) departureQuery._id = dto.departureId;

    const completedDepartures = await this.departureModel
      .find(departureQuery)
      .select('_id legacyFlagshipId')
      .lean()
      .exec();

    if (!completedDepartures.length) {
      throw new ForbiddenException('Reviews can be submitted after completing a departure for this trip series.');
    }

    const departureIds = completedDepartures.map((departure: any) => departure._id);
    const legacyFlagshipIds = completedDepartures
      .map((departure: any) => departure.legacyFlagshipId)
      .filter(Boolean);
    const registrationMatch: any[] = [{ departureId: { $in: departureIds } }];
    if (legacyFlagshipIds.length) {
      registrationMatch.push({ flagship: { $in: legacyFlagshipIds } });
      registrationMatch.push({ flagshipId: { $in: legacyFlagshipIds } });
    }

    const registrationQuery: any = {
      userId,
      status: RegistrationStatus.CONFIRMED,
      seatLocked: true,
      $and: [
        {
          $or: [
            { cancelledAt: { $exists: false } },
            { cancelledAt: null },
          ],
        },
        { $or: registrationMatch },
      ],
    };
    if (dto.registrationId) registrationQuery._id = dto.registrationId;

    const registration = await this.registrationModel
      .findOne(registrationQuery)
      .sort({ completedAt: -1, updatedAt: -1 })
      .lean()
      .exec() as any;

    if (!registration) {
      throw new ForbiddenException('Only travelers who completed a departure for this trip series can submit a review.');
    }

    const registrationDepartureId = registration.departureId ? String(registration.departureId) : '';
    const matchedDeparture = registrationDepartureId
      ? completedDepartures.find((departure: any) => String(departure._id) === registrationDepartureId)
      : completedDepartures.find((departure: any) => {
          const legacyFlagshipId = String(departure.legacyFlagshipId || '');
          return (
            legacyFlagshipId &&
            (legacyFlagshipId === String(registration.flagship || '') ||
              legacyFlagshipId === String(registration.flagshipId || ''))
          );
        });

    return {
      registration,
      departureId: matchedDeparture ? String(matchedDeparture._id) : registrationDepartureId || dto.departureId,
    };
  }

  async markReviewHelpful(slug: string, reviewId: string, userId: string) {
    const series = await this.tripSeriesModel
      .findOne({ slug, status: 'active' })
      .select('_id')
      .lean()
      .exec() as any;
    if (!series) throw new NotFoundException('Trip series not found.');

    const review = await this.reviewModel
      .findOne({ _id: reviewId, tripSeriesId: series._id, status: 'published' })
      .exec();
    if (!review) throw new NotFoundException('Trip series review not found.');
    if (review.userId && String(review.userId) === String(userId)) {
      throw new BadRequestException('You cannot mark your own review helpful.');
    }

    const existingHelpfulUserIds = Array.isArray((review as any).helpfulUserIds)
      ? (review as any).helpfulUserIds.map((id: any) => String(id))
      : [];
    if (!existingHelpfulUserIds.includes(String(userId))) {
      (review as any).helpfulUserIds = [
        ...((review as any).helpfulUserIds || []),
        new Types.ObjectId(userId),
      ];
      (review as any).helpfulCount = existingHelpfulUserIds.length + 1;
      await review.save();
    }

    const populated = await this.reviewModel
      .findById(review._id)
      .populate('userId', 'fullName email city')
      .lean()
      .exec();
    return this.attachSignedReviewMedia(populated);
  }

  async updateReview(id: string, dto: UpdateTripSeriesReviewDto) {
    const existing = await this.reviewModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Trip series review not found.');
    const updated = await this.reviewModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .populate('userId', 'fullName email city')
      .exec();
    await this.recalculateSeriesRating(String(existing.tripSeriesId));
    return this.attachSignedReviewMedia(updated);
  }

  async getReviewsForSeries(
    seriesId: string,
    options?: { publishedOnly?: boolean; limit?: number },
  ) {
    const query: any = { tripSeriesId: seriesId };
    if (options?.publishedOnly) query.status = 'published';
    const limit = Math.max(1, Math.min(100, Number(options?.limit || 20)));
    const reviews = await this.reviewModel
      .find(query)
      .populate('userId', 'fullName email city')
      .sort({ featured: -1, helpfulCount: -1, createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return Promise.all(reviews.map((review) => this.attachSignedReviewMedia(review)));
  }

  async recalculateSeriesRating(seriesId: string) {
    const rows = await this.reviewModel.aggregate([
      {
        $match: {
          tripSeriesId: new Types.ObjectId(seriesId),
          status: 'published',
        },
      },
      {
        $group: {
          _id: '$tripSeriesId',
          ratingAverage: { $avg: '$rating' },
          ratingCount: { $sum: 1 },
        },
      },
    ]);
    const row = rows[0];
    await this.tripSeriesModel.findByIdAndUpdate(seriesId, {
      ratingAverage: row ? Math.round(Number(row.ratingAverage || 0) * 10) / 10 : 0,
      ratingCount: row ? Number(row.ratingCount || 0) : 0,
    });
  }
}
