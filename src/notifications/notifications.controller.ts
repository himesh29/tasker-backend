import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findMine(@CurrentUser() actor: JwtPayload, @Query('unread') unread?: string) {
    return this.notificationsService.findMine(actor.sub, unread === 'true');
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() actor: JwtPayload) {
    return this.notificationsService.unreadCount(actor.sub);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.notificationsService.markRead(id, actor);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() actor: JwtPayload) {
    return this.notificationsService.markAllRead(actor.sub);
  }
}

