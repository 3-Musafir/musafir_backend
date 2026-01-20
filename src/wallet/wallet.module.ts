import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from 'src/user/schemas/user.schema';
import { WalletBalanceSchema } from './schemas/wallet-balance.schema';
import { WalletTransactionSchema } from './schemas/wallet-transaction.schema';
import { WalletAdminController } from './wallet.admin.controller';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'WalletBalance', schema: WalletBalanceSchema },
      { name: 'WalletTransaction', schema: WalletTransactionSchema },
    ]),
  ],
  providers: [WalletService],
  controllers: [WalletController, WalletAdminController],
  exports: [WalletService],
})
export class WalletModule {}
