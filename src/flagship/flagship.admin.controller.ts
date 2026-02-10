import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { FlagshipService } from './flagship.service';

@ApiTags('admin.flagship')
@Controller('admin/flagship')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class FlagshipAdminController {
  constructor(private readonly flagshipService: FlagshipService) {}

  @Get(':flagshipId/group-conflicts')
  @ApiOperation({ summary: 'Admin: list group conflicts for a flagship' })
  @ApiOkResponse({})
  async getGroupConflicts(@Param('flagshipId') flagshipId: string) {
    return {
      statusCode: 200,
      message: 'Group conflicts fetched successfully.',
      data: await this.flagshipService.getGroupConflicts(flagshipId),
    };
  }

  @Get(':flagshipId/group-analytics')
  @ApiOperation({ summary: 'Admin: group link analytics for a flagship' })
  @ApiOkResponse({})
  async getGroupAnalytics(@Param('flagshipId') flagshipId: string) {
    return {
      statusCode: 200,
      message: 'Group analytics fetched successfully.',
      data: await this.flagshipService.getGroupAnalytics(flagshipId),
    };
  }

  @Get(':flagshipId/discount-analytics')
  @ApiOperation({ summary: 'Admin: discount analytics for a flagship' })
  @ApiOkResponse({})
  async getDiscountAnalytics(@Param('flagshipId') flagshipId: string) {
    return {
      statusCode: 200,
      message: 'Discount analytics fetched successfully.',
      data: await this.flagshipService.getDiscountAnalytics(flagshipId),
    };
  }

  @Post(':flagshipId/reconcile-links')
  @ApiOperation({ summary: 'Admin: reconcile stale group links for a flagship' })
  @ApiOkResponse({})
  async reconcileLinks(@Param('flagshipId') flagshipId: string) {
    return {
      statusCode: 200,
      message: 'Group links reconciled successfully.',
      data: await this.flagshipService.reconcileGroupLinks(flagshipId),
    };
  }
}
