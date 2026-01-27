import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GoogleIntegrationController } from './google-integration.controller';
import { GoogleSheetsService } from './google-sheets.service';
import { GoogleSheetCredentialSchema } from './schemas/google-sheet-credential.schema';
import { GoogleSheetRowSchema } from './schemas/google-sheet-row.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'GoogleSheetCredential', schema: GoogleSheetCredentialSchema },
      { name: 'GoogleSheetRow', schema: GoogleSheetRowSchema },
    ]),
  ],
  controllers: [GoogleIntegrationController],
  providers: [GoogleSheetsService],
  exports: [GoogleSheetsService],
})
export class GoogleIntegrationModule {}
