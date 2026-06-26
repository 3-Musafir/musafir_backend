import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { optimizeImageToWebp } from 'src/common/image-optimizer';
import { StorageService } from 'src/storage/storageService';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import {
  CompanyProfile,
  CompanyProfileDocument,
} from './interfaces/company-profile.interface';

@Injectable()
export class CompanyProfileService {
  private readonly logger = new Logger(CompanyProfileService.name);

  constructor(
    @InjectModel('CompanyProfile')
    private readonly companyProfileModel: Model<CompanyProfileDocument>,
    private readonly storageService: StorageService,
  ) { }

  async getProfile(): Promise<CompanyProfile | null> {
    const profile = await this.companyProfileModel.findOne().lean();
    if (!profile) {
      return null;
    }

    const logoUrl = profile.logoKey
      ? await this.storageService.getSignedUrl(profile.logoKey)
      : undefined;

    return { ...profile, logoUrl };
  }

  async upsertProfile(
    updateDto: UpdateCompanyProfileDto,
    logo?: Express.Multer.File,
  ): Promise<CompanyProfile> {
    const existingProfile = await this.companyProfileModel.findOne();
    const updateData: Partial<CompanyProfile> = {};

    if (updateDto.name !== undefined) {
      updateData.name = updateDto.name;
    }
    if (updateDto.description !== undefined) {
      updateData.description = updateDto.description;
    }

    let uploadedLogoKey: string | undefined;

    if (logo) {
      try {
        const optimizedBuffer = await optimizeImageToWebp(logo.buffer, {
          ...logo,
          quality: 85,
          resize: { width: 400, height: 400, fit: 'inside' },
        });

        const fileKey = `company-profile/logo-${Date.now()}.webp`;
        await this.storageService.uploadFile(fileKey, optimizedBuffer, 'image/webp');
        uploadedLogoKey = fileKey;
        updateData.logoKey = fileKey;
      } catch (error) {
        throw new BadRequestException(
          `Failed to upload logo: ${error?.message || 'Invalid image'}`,
        );
      }
    }

    if (!existingProfile && (!updateData.name || !updateData.description)) {
      throw new BadRequestException('Name and description are required to create the company profile');
    }

    let savedProfile: CompanyProfileDocument | null;

    if (existingProfile) {
      savedProfile = await this.companyProfileModel.findByIdAndUpdate(
        existingProfile._id,
        { $set: updateData },
        { new: true, runValidators: true },
      );

      if (!savedProfile) {
        throw new NotFoundException('Company profile not found');
      }
    } else {
      savedProfile = await this.companyProfileModel.create(updateData);
    }

    if (uploadedLogoKey && existingProfile?.logoKey && existingProfile.logoKey !== uploadedLogoKey) {
      try {
        await this.storageService.deleteFile(existingProfile.logoKey);
      } catch (error) {
        this.logger.warn(`Failed to delete old logo key: ${error?.message || error}`);
      }
    }

    if (!savedProfile) {
      throw new InternalServerErrorException('Unable to save company profile');
    }

    const plainProfile =
      typeof savedProfile.toObject === 'function'
        ? savedProfile.toObject()
        : (savedProfile as CompanyProfile);

    const logoUrl = plainProfile.logoKey
      ? await this.storageService.getSignedUrl(plainProfile.logoKey)
      : undefined;

    return { ...plainProfile, logoUrl };
  }
}
