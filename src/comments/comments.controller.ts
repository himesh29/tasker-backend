import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ReactDto } from './dto/react.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  create(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(taskId, actor, dto);
  }

  @Get()
  findAll(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.commentsService.findAllForTask(taskId, actor);
 }

  // FIX (#10): taskId is now passed through so the service can
  // confirm this comment actually belongs to this task.
  @Patch(':commentId')
  update(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(taskId, commentId, actor, dto);
  }

  @Delete(':commentId')
  remove(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.commentsService.remove(taskId, commentId, actor);
  }

  @Post(':commentId/reactions')
  react(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: ReactDto,
  ) {
    return this.commentsService.react(taskId, commentId, actor, dto.emoji);
  }

  @Delete(':commentId/reactions/:emoji')
  unreact(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Param('emoji') emoji: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.commentsService.unreact(taskId, commentId, actor, emoji);
  }

  @Post(':commentId/pin')
  pin(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.commentsService.pin(taskId, commentId, actor);
  }

  @Delete(':commentId/pin')
  unpin(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.commentsService.unpin(taskId, commentId, actor);
  }
}

