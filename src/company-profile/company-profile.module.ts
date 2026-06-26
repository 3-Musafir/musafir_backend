import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorageModule } from 'src/storage/storage.module';
import { CompanyProfileController } from './company-profile.controller';
import { CompanyProfileService } from './company-profile.service';
import { CompanyProfileSchema } from './schemas/company-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'CompanyProfile', schema: CompanyProfileSchema },
    ]),
    StorageModule,
  ],
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
  exports: [CompanyProfileService],
})
export class CompanyProfileModule { }
