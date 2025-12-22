import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';
import { CompanyProfileSchema } from './schemas/company-profile.schema';
import { StorageService } from 'src/storage/storageService';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'CompanyProfile', schema: CompanyProfileSchema },
    ]),
  ],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService, StorageService, ConfigService],
  exports: [CompanyProfileService],
})
export class CompanyProfileModule { }
