import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAccessService } from '../common/task-access.service';
import { JwtPayload } from '../auth/auth.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  async create(taskId: string, actor: JwtPayload, dto: CreateCommentDto) {
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanView(actor.sub, task);

    const mentionIds = dto.mentionedUserIds ?? [];
    if (mentionIds.length) {
      const validUsers = await this.prisma.user.findMany({
        where: { id: { in: mentionIds } },
        select: { id: true },
      });
      const validIds = new Set(validUsers.map((u) => u.id));
      const missing = mentionIds.filter((id) => !validIds.has(id));
      if (missing.length) {
        throw new NotFoundException(`Mentioned user(s) not found: ${missing.join(', ')}`);
      }

      // FIX: this used to only check that the mentioned ids were real
      // users — it didn't check they could actually see the task. That
      // meant you could @mention (and notify) any user in the system,
      // including ones with no access to the task's project. Now every
      // mentioned id has to pass the same view-access check as everyone
      // else who touches this task.
      const withoutAccess: string[] = [];
      for (const id of mentionIds) {
        try {
          await this.taskAccess.assertCanView(id, task);
        } catch {
          withoutAccess.push(id);
        }
      }
      if (withoutAccess.length) {
        throw new BadRequestException(
          `Mentioned user(s) don't have access to this task: ${withoutAccess.join(', ')}`,
        );
      }
    }

    const comment = await this.prisma.comment.create({
      data: {
        taskId,
        authorId: actor.sub,
        text: dto.text,
        mentions: mentionIds.length
          ? { create: mentionIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        mentions: true,
      },
    });

    await this.prisma.activity.create({
      data: { taskId, actorId: actor.sub, action: 'commented' },
    });

    await this.notifyOnComment(taskId, comment.id, actor.sub, mentionIds);

    return comment;
  }

  async findAllForTask(taskId: string, actor: JwtPayload) {
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanView(actor.sub, task);

    return this.prisma.comment.findMany({
      where: { taskId },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        reactions: true,
        mentions: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(taskId: string, commentId: string, actor: JwtPayload, dto: UpdateCommentDto) {
    const comment = await this.ensureCommentExists(taskId, commentId);

    if (comment.authorId !== actor.sub) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { text: dto.text },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        reactions: true,
        mentions: { include: { user: { select: { id: true, name: true } } } },
      },
    });
  }

  async remove(taskId: string, commentId: string, actor: JwtPayload) {
    const comment = await this.ensureCommentExists(taskId, commentId);

    if (comment.authorId !== actor.sub) {
      const task = await this.getTaskOrThrow(taskId);
      await this.taskAccess.assertCanManage(actor.sub, task);
    }

    return this.prisma.comment.delete({ where: { id: commentId } });
  }

  async react(taskId: string, commentId: string, actor: JwtPayload, emoji: string) {
    await this.ensureCommentExists(taskId, commentId);
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanView(actor.sub, task);

    return this.prisma.commentReaction.upsert({
      where: { commentId_userId_emoji: { commentId, userId: actor.sub, emoji } },
      update: {},
      create: { commentId, userId: actor.sub, emoji },
    });
  }

  async unreact(taskId: string, commentId: string, actor: JwtPayload, emoji: string) {
    await this.ensureCommentExists(taskId, commentId);
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanView(actor.sub, task);

    return this.prisma.commentReaction.delete({
      where: { commentId_userId_emoji: { commentId, userId: actor.sub, emoji } },
    });
  }

  async pin(taskId: string, commentId: string, actor: JwtPayload) {
    const comment = await this.ensureCommentExists(taskId, commentId);
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanManage(actor.sub, task);

    return this.prisma.$transaction(async (tx) => {
      await tx.comment.updateMany({
        where: { taskId: comment.taskId, id: { not: commentId }, pinnedAt: { not: null } },
        data: { pinnedAt: null },
      });

      return tx.comment.update({
        where: { id: commentId },
        data: { pinnedAt: new Date() },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          reactions: true,
          mentions: { include: { user: { select: { id: true, name: true } } } },
        },
      });
    });
  }

  async unpin(taskId: string, commentId: string, actor: JwtPayload) {
    await this.ensureCommentExists(taskId, commentId);
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanManage(actor.sub, task);

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { pinnedAt: null },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        reactions: true,
        mentions: { include: { user: { select: { id: true, name: true } } } },
      },
    });
  }

  private async ensureCommentExists(taskId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.taskId !== taskId) {
      throw new NotFoundException('Comment not found');
    }
    return comment;
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // FIX (#10): view/manage/pin permission checks all lived here as exact
  // (or, for "pin", functionally identical) duplicates of the logic in
  // TasksService and AttachmentsService. Now delegated to TaskAccessService
  // (see src/common/task-access.service.ts) — "pin" used the same rule as
  // "manage" (task creator or project owner), so it maps to assertCanManage.

  private async notifyOnComment(
    taskId: string,
    commentId: string,
    actorId: string,
    mentionIds: string[],
  ) {
    const [members, watchers] = await Promise.all([
      this.prisma.taskMember.findMany({ where: { taskId }, select: { userId: true } }),
      this.prisma.taskWatcher.findMany({ where: { taskId }, select: { userId: true } }),
    ]);

    const mentionSet = new Set(mentionIds);
    const commentRecipients = new Set(
      [...members.map((m) => m.userId), ...watchers.map((w) => w.userId)].filter(
        (id) => id !== actorId && !mentionSet.has(id),
      ),
    );

    const notifications: any[] = [];

    for (const recipientId of commentRecipients) {
      notifications.push({
        recipientId,
        actorId,
        type: 'comment',
        taskId,
        commentId,
        message: 'New comment on a task you’re following',
      });
    }

    for (const recipientId of mentionIds) {
      if (recipientId === actorId) continue;
      notifications.push({
        recipientId,
        actorId,
        type: 'mention',
        taskId,
        commentId,
        message: 'You were mentioned in a comment',
      });
    }

    if (notifications.length) {
      await this.prisma.notification.createMany({ data: notifications });
    }
  }
}

