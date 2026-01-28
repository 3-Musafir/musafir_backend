import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { User } from 'src/user/interfaces/user.interface';
import {
  AdminWalletAdjustDto,
  AdminWalletCreditDto,
  WalletListTransactionsQueryDto,
} from './dto/wallet.dto';
import { WALLET_TOPUP_PACKAGES_PKR, WALLET_TOPUP_WHATSAPP_NUMBER } from './wallet.constants';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my wallet summary' })
  @ApiOkResponse({})
  async getSummary(@GetUser() user: User) {
    const userId = user?._id?.toString();
    if (!userId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'wallet_auth_required',
      });
    }
    const balance = await this.walletService.getBalance(userId);
    return {
      ...balance,
      currency: 'PKR',
      topupPackages: WALLET_TOPUP_PACKAGES_PKR,
      whatsappTopupNumber: WALLET_TOPUP_WHATSAPP_NUMBER,
    };
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List my wallet transactions' })
  @ApiOkResponse({})
  listTransactions(
    @GetUser() user: User,
    @Query() query: WalletListTransactionsQueryDto,
  ) {
    const userId = user?._id?.toString();
    if (!userId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'wallet_auth_required',
      });
    }
    return this.walletService.listTransactions(userId, query);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my wallet summary' })
  @ApiOkResponse({})
  async getMyWallet(@GetUser() user: User) {
    const userId = user?._id?.toString();
    if (!userId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'wallet_auth_required',
      });
    }
    const balance = await this.walletService.getBalance(userId);
    return {
      ...balance,
      currency: 'PKR',
      topupPackages: WALLET_TOPUP_PACKAGES_PKR,
      whatsappTopupNumber: WALLET_TOPUP_WHATSAPP_NUMBER,
    };
  }

  @Get('me/transactions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List my wallet transactions' })
  @ApiOkResponse({})
  listMyTransactions(
    @GetUser() user: User,
    @Query() query: WalletListTransactionsQueryDto,
  ) {
    const userId = user?._id?.toString();
    if (!userId) {
      throw new BadRequestException({
        message: 'Authentication required.',
        code: 'wallet_auth_required',
      });
    }
    return this.walletService.listTransactions(userId, query);
  }

  @Post('admin/topup')
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: credit fixed top-up package' })
  @ApiOkResponse({})
  adminTopup(@GetUser() admin: User, @Body() body: AdminWalletCreditDto) {
    const idempotencyKey = body.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException({
        message: 'Idempotency key is required.',
        code: 'wallet_idempotency_required',
      });
    }
    return this.walletService.credit({
      userId: body.userId,
      amount: body.amount,
      type: 'topup',
      sourceType: 'topup_manual',
      sourceId: `topup_manual:${idempotencyKey}`,
      postedBy: String(admin?._id || ''),
      note: body.note,
      metadata: { packageAmount: body.amount, sourceRef: idempotencyKey },
    });
  }

  @Post('admin/adjust')
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: manual wallet adjustment' })
  @ApiOkResponse({})
  adminAdjust(@GetUser() admin: User, @Body() body: AdminWalletAdjustDto) {
    const idempotencyKey = body.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException({
        message: 'Idempotency key is required.',
        code: 'wallet_idempotency_required',
      });
    }
    const direction = body.direction;
    const common = {
      userId: body.userId,
      amount: body.amount,
      type: 'manual_adjustment',
      sourceType: 'manual_adjustment',
      sourceId: `manual_adjustment:${idempotencyKey}`,
      postedBy: String(admin?._id || ''),
      note: body.note,
      metadata: { direction, sourceRef: idempotencyKey },
    };
    return direction === 'credit'
      ? this.walletService.credit(common)
      : this.walletService.debit(common);
  }
}
