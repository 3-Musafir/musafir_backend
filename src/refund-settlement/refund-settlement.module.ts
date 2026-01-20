import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletModule } from 'src/wallet/wallet.module';
import { RefundSettlementSchema } from './schemas/refund-settlement.schema';
import { RefundSettlementService } from './refund-settlement.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'RefundSettlement', schema: RefundSettlementSchema }]),
    WalletModule,
  ],
  providers: [RefundSettlementService],
  exports: [RefundSettlementService],
})
export class RefundSettlementModule {}

