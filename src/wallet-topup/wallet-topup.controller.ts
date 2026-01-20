import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { User } from 'src/user/interfaces/user.interface';
import { AdminListTopupsQueryDto, AdminRejectTopupDto, CreateTopupRequestDto } from './dto/topup.dto';
import { WalletTopupService } from './wallet-topup.service';

@ApiTags('wallet.topup')
@Controller('wallet')
export class WalletTopupController {
  constructor(private readonly walletTopupService: WalletTopupService) {}

  @Post('topup-request')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a wallet top-up request (fixed packages only)' })
  @ApiOkResponse({})
  createTopupRequest(@GetUser() user: User, @Body() body: CreateTopupRequestDto) {
    return this.walletTopupService.createTopupRequest(user, body.packageAmount);
  }
}

@ApiTags('admin.topup')
@Controller('admin/topups')
@Roles('admin')
export class AdminTopupController {
  constructor(private readonly walletTopupService: WalletTopupService) {}

  @Get()
  @ApiOperation({ summary: 'Admin: list top-up requests' })
  @ApiOkResponse({})
  list(@Query() query: AdminListTopupsQueryDto) {
    return this.walletTopupService.adminListTopupsPaginated(query);
  }

  @Patch(':id/mark-credited')
  @ApiOperation({ summary: 'Admin: mark top-up request as credited (creates wallet credit)' })
  @ApiOkResponse({})
  markCredited(@Param('id') id: string, @GetUser() admin: User) {
    return this.walletTopupService.markCredited(id, admin);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Admin: reject a top-up request' })
  @ApiOkResponse({})
  reject(
    @Param('id') id: string,
    @GetUser() admin: User,
    @Body() body: AdminRejectTopupDto,
  ) {
    return this.walletTopupService.rejectTopup(id, admin, body?.reason);
  }
}
