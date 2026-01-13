import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { AuthenticatedRequest } from 'src/user/interfaces/authenticated-request';
import { NotificationService } from './notification.service';
import { successResponse } from 'src/constants/response';
import { buildProfileStatus } from 'src/user/profile-status.util';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List notifications for the current user' })
  async list(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('read') read: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const user = (req as any)?.user;
    const parsedRead = read === 'true' ? true : read === 'false' ? false : undefined;
    if (user?._id) {
      const plainUser = typeof (user as any).toObject === 'function' ? (user as any).toObject() : user;
      const profileStatus = buildProfileStatus(plainUser || {});
      await this.notificationService.ensureProfileCompletionReminder(
        String(plainUser._id),
        profileStatus,
      );
    }
    const data = await this.notificationService.listForUser(user._id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      read: parsedRead,
    });
    return successResponse(data, 'Notifications fetched');
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a single notification as read' })
  async markRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const user = (req as any)?.user;
    const data = await this.notificationService.markRead(user._id, id);
    return successResponse(data, 'Notification marked as read');
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAll(@Req() req: AuthenticatedRequest) {
    const user = (req as any)?.user;
    const data = await this.notificationService.markAllRead(user._id);
    return successResponse(data, 'All notifications marked as read');
  }
}
