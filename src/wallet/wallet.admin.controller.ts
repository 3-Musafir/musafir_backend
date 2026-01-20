import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { AdminWalletsQueryDto, WalletListTransactionsQueryDto } from './dto/wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('admin.wallet')
@Controller('admin/wallets')
@Roles('admin')
export class WalletAdminController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Admin: list wallets (balances)' })
  @ApiOkResponse({})
  listWallets(@Query() query: AdminWalletsQueryDto) {
    return this.walletService.adminListWallets(query);
  }

  @Get(':userId/transactions')
  @ApiOperation({ summary: 'Admin: list wallet transactions for a user' })
  @ApiOkResponse({})
  listUserTransactions(
    @Param('userId') userId: string,
    @Query() query: WalletListTransactionsQueryDto,
  ) {
    if (!userId) {
      throw new BadRequestException({
        message: 'userId is required.',
        code: 'wallet_user_id_required',
      });
    }
    return this.walletService.listTransactions(userId, query);
  }

  @Get(':userId/summary')
  @ApiOperation({ summary: 'Admin: get wallet summary for a user' })
  @ApiOkResponse({})
  async getUserSummary(@Param('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException({
        message: 'userId is required.',
        code: 'wallet_user_id_required',
      });
    }
    return this.walletService.getBalance(userId);
  }
}

