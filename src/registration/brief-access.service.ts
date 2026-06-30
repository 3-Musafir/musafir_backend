import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StorageService } from 'src/storage/storageService';
import { Registration } from './interfaces/registration.interface';
import { RegistrationBriefDto } from './dto/passport-registration.dto';

interface BriefRegistrationSnapshot {
  userId?: unknown;
  user?: unknown;
  cancelledAt?: unknown;
  refundStatus?: unknown;
  flagship?: { detailedPlan?: unknown };
}

@Injectable()
export class BriefAccessService {
  constructor(
    @InjectModel('Registration') private readonly registrationModel: Model<Registration>,
    private readonly storageService: StorageService,
  ) {}

  async getBrief(registrationId: string, userId: string): Promise<RegistrationBriefDto> {
    const registration = (await this.registrationModel
      .findById(registrationId)
      .populate('flagship')
      .lean()
      .exec()) as unknown as BriefRegistrationSnapshot | null;
    if (!registration) throw new NotFoundException('Registration not found.');

    const ownerId = registration.userId || registration.user;
    if (!ownerId || String(ownerId) !== String(userId)) {
      throw new ForbiddenException('You do not have access to this trip brief.');
    }

    const refundStatus = String(registration.refundStatus || 'none');
    if (registration.cancelledAt || ['pending', 'processing', 'refunded'].includes(refundStatus)) {
      throw new ForbiddenException('Trip brief access is unavailable for this registration.');
    }

    const key = registration.flagship?.detailedPlan;
    if (!key) return { available: false };
    return { available: true, url: await this.storageService.getSignedUrl(String(key)) };
  }
}
