import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAccessService } from '../common/task-access.service';
import { JwtPayload } from '../auth/auth.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  async create(creator: JwtPayload, dto: CreateTaskDto) {
    let parentTask: any = null;

    if (dto.parentTaskId) {
      parentTask = await this.prisma.task.findUnique({ where: { id: dto.parentTaskId } });
      if (!parentTask) throw new NotFoundException('Parent task not found');
      if (!dto.summary) {
        throw new BadRequestException('Subtasks require a summary in addition to a title');
      }

      if (parentTask.isLocked) {
        throw new ForbiddenException('Parent task is locked; no new subtasks can be created');
      }

      await this.assertCanCreateSubtasks(creator.sub, parentTask);

      if (dto.projectId && parentTask.projectId && dto.projectId !== parentTask.projectId) {
        throw new BadRequestException('Subtask must belong to the same project as its parent');
      }
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('Project not found');

      const isOwner = project.ownerId === creator.sub;
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: dto.projectId, userId: creator.sub } },
      });

      if (!isOwner && !member) {
        throw new ForbiddenException('Only project members can create tasks in this project');
      }
    }

    if (dto.reporterId) {
      const reporter = await this.prisma.user.findUnique({ where: { id: dto.reporterId } });
      if (!reporter) throw new NotFoundException('Reporter not found');
    }

    const dateRangeStart = dto.dateRangeStart ? new Date(dto.dateRangeStart) : undefined;
    const dateRangeEnd = dto.dateRangeEnd ? new Date(dto.dateRangeEnd) : undefined;
    this.assertValidDateRange(dateRangeStart, dateRangeEnd);

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        summary: dto.summary,
        description: dto.description,
        projectId: dto.projectId ?? parentTask?.projectId ?? undefined,
        tag: dto.tag,
        parentTaskId: dto.parentTaskId,
        priority: (dto.priority as any) ?? undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        dateRangeStart,
        dateRangeEnd,
        reporterId: dto.reporterId ?? creator.sub,
        createdById: creator.sub,
        approvalStatus: 'not_required',
      },
      include: { project: true, parentTask: true },
    });

    await this.logActivity(task.id, creator.sub, 'created');
    return task;
  }

  async findAll(actor: JwtPayload, query: TaskQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 500;
    const skip = (page - 1) * limit;

    const baseWhere = {
      projectId: query.projectId,
      tag: query.tag,
      status: query.status as any,
      members: query.assigneeId ? { some: { userId: query.assigneeId } } : undefined,
    };

    const permissionFilter = {
      OR: [
        { project: { ownerId: actor.sub } },
        { project: { members: { some: { userId: actor.sub } } } },
        { projectId: null, createdById: actor.sub },
        { projectId: null, members: { some: { userId: actor.sub } } },
        { projectId: null, watchers: { some: { userId: actor.sub } } },
      ],
    };

    const where = { AND: [baseWhere, permissionFilter] };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          members: { include: { user: { select: { id: true, name: true, email: true } } } },
          _count: { select: { subtasks: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(actor: JwtPayload, id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        parentTask: { select: { id: true, title: true } },
        subtasks: {
          include: {
            members: { include: { user: { select: { id: true, name: true, email: true } } } },
          },
        },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        watchers: { include: { user: { select: { id: true, name: true } } } },
        reporter: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        activities: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!task) throw new NotFoundException('Task not found');
    await this.taskAccess.assertCanView(actor.sub, task);

    return task;
  }

  async update(id: string, actor: JwtPayload, dto: UpdateTaskDto) {
    const task = await this.getOrThrow(id);
    await this.taskAccess.assertCanView(actor.sub, task);

    if (task.isLocked) {
      const relevantKeys = Object.keys(dto).filter(key => dto[key] !== undefined);
      const onlyUnlocking =
        relevantKeys.length === 1 &&
        relevantKeys[0] === 'isLocked' &&
        dto.isLocked === false;

      if (!onlyUnlocking) {
        throw new ForbiddenException('Task is locked and cannot be edited');
      }

      await this.taskAccess.assertCanManage(actor.sub, task);
    } else {
      if (dto.isLocked !== undefined && dto.isLocked !== task.isLocked) {
        await this.taskAccess.assertCanManage(actor.sub, task);
      } else {
        await this.assertCanEditTask(actor.sub, task);
      }
    }

    if (dto.reporterId) {
      const reporter = await this.prisma.user.findUnique({ where: { id: dto.reporterId } });
      if (!reporter) throw new NotFoundException('Reporter not found');
    }

    // FIX (#2): allow clearing dates by sending null
    const effectiveDateRangeStart = dto.dateRangeStart === undefined ? undefined : (dto.dateRangeStart === null ? null : new Date(dto.dateRangeStart));
    const effectiveDateRangeEnd = dto.dateRangeEnd === undefined ? undefined : (dto.dateRangeEnd === null ? null : new Date(dto.dateRangeEnd));
    this.assertValidDateRange(effectiveDateRangeStart ?? task.dateRangeStart, effectiveDateRangeEnd ?? task.dateRangeEnd);

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        summary: dto.summary,
        description: dto.description,
        status: dto.status as any,
        priority: dto.priority as any,
        tag: dto.tag,
        dueDate: dto.dueDate === undefined ? undefined : (dto.dueDate === null ? null : new Date(dto.dueDate)),
        dateRangeStart: dto.dateRangeStart === undefined ? undefined : (dto.dateRangeStart === null ? null : new Date(dto.dateRangeStart)),
        dateRangeEnd: dto.dateRangeEnd === undefined ? undefined : (dto.dateRangeEnd === null ? null : new Date(dto.dateRangeEnd)),
        isLocked: dto.isLocked,
        reporterId: dto.reporterId === undefined ? undefined : dto.reporterId,
      },
    });

    if (dto.status && dto.status !== task.status) {
      await this.logActivity(id, actor.sub, 'status_changed', dto.status);
      await this.notifyWatchersOfStatusChange(id, actor.sub, dto.status);
    }
    if (dto.priority && dto.priority !== task.priority) {
      await this.logActivity(id, actor.sub, 'priority_changed', dto.priority);
    }
    if (dto.isLocked !== undefined && dto.isLocked !== task.isLocked) {
      await this.logActivity(id, actor.sub, dto.isLocked ? 'locked' : 'unlocked');
    }
    if (dto.reporterId !== undefined && dto.reporterId !== task.reporterId) {
      await this.logActivity(id, actor.sub, 'updated', 'reporter changed');
    }

    return updated;
  }

  async remove(id: string, actor: JwtPayload) {
    const task = await this.getOrThrow(id);
    await this.taskAccess.assertCanView(actor.sub, task);

    if (task.isLocked) {
      throw new ForbiddenException('Task is locked and cannot be deleted');
    }

    await this.assertCanEditTask(actor.sub, task);

    const taskIds = await this.collectTaskAndDescendantIds(id);

    const attachments = await this.prisma.attachment.findMany({
      where: { taskId: { in: taskIds }, type: 'file', storageKey: { not: null } },
    });

    const deletedTask = await this.prisma.task.delete({ where: { id } });

    for (const att of attachments) {
      if (att.storageKey) {
        await unlink(join(process.cwd(), 'uploads', att.storageKey)).catch(() => undefined);
      }
    }

    return deletedTask;
  }

  private async collectTaskAndDescendantIds(rootId: string): Promise<string[]> {
    const ids = [rootId];
    let frontier = [rootId];

    while (frontier.length) {
      const children = await this.prisma.task.findMany({
        where: { parentTaskId: { in: frontier } },
        select: { id: true },
      });
      if (!children.length) break;
      frontier = children.map((c) => c.id);
      ids.push(...frontier);
    }

    return ids;
  }

  async addMembers(id: string, userIds: string[], actor: JwtPayload) {
    const task = await this.getOrThrow(id);
    await this.taskAccess.assertCanView(actor.sub, task);

    if (task.isLocked) {
      throw new ForbiddenException('Task is locked');
    }

    await this.taskAccess.assertCanManage(actor.sub, task);

    for (const userId of userIds) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException(`User not found: ${userId}`);
    }

    if (task.projectId) {
      await this.assertUsersAreProjectMembers(task.projectId, userIds);
    }

    await this.prisma.taskMember.createMany({
      data: userIds.map((userId) => ({ taskId: id, userId })),
      skipDuplicates: true,
    });

    await this.prisma.notification.createMany({
      data: userIds
        .filter((userId) => userId !== actor.sub)
        .map((recipientId) => ({
          recipientId,
          actorId: actor.sub,
          type: 'assignment',
          taskId: id,
          message: `You were assigned to "${task.title}"`,
        })),
    });

    await this.logActivity(id, actor.sub, 'assigned', userIds.join(', '));
    return this.findOne(actor, id);
  }

  async removeMember(id: string, userId: string, actor: JwtPayload) {
    const task = await this.getOrThrow(id);
    await this.taskAccess.assertCanView(actor.sub, task);

    if (task.isLocked) {
      throw new ForbiddenException('Task is locked');
    }

    await this.taskAccess.assertCanManage(actor.sub, task);

    await this.prisma.taskMember.delete({
      where: { taskId_userId: { taskId: id, userId } },
    });

    return this.findOne(actor, id);
  }

  async watch(id: string, userId: string) {
    const task = await this.getOrThrow(id);
    await this.taskAccess.assertCanView(userId, task);

    return this.prisma.taskWatcher.upsert({
      where: { taskId_userId: { taskId: id, userId } },
      update: {},
      create: { taskId: id, userId },
    });
  }

  async unwatch(id: string, userId: string) {
    const task = await this.getOrThrow(id);
    await this.taskAccess.assertCanView(userId, task);

    return this.prisma.taskWatcher.delete({
      where: { taskId_userId: { taskId: id, userId } },
    });
  }

  // FIX (#3): allow task members to edit subtasks too
  private async assertCanEditTask(userId: string, task: any) {
    if (task.parentTaskId) {
      // Check if user is the creator, a project owner, or a task member
      if (task.createdById === userId) return;

      if (task.projectId) {
        const project = await this.prisma.project.findUnique({
          where: { id: task.projectId },
          select: { ownerId: true },
        });
        if (project?.ownerId === userId) return;
      }

      const member = await this.prisma.taskMember.findUnique({
        where: { taskId_userId: { taskId: task.id, userId } },
      });
      if (member) return;

      throw new ForbiddenException('Only the subtask creator, project owner, or assigned members can edit this subtask');
    }

    const isCreator = task.createdById === userId;
    const isMember = await this.prisma.taskMember.findUnique({
      where: { taskId_userId: { taskId: task.id, userId } },
    });

    if (isCreator || isMember) return;

    if (task.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: task.projectId },
        select: { ownerId: true },
      });
      if (project?.ownerId === userId) return;
    }

    throw new ForbiddenException('You do not have permission to edit this task');
  }

  private async assertCanCreateSubtasks(userId: string, parentTask: any) {
    if (parentTask.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: parentTask.projectId },
        select: { ownerId: true },
      });

      if (project?.ownerId === userId) return;

      const projectMember = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: parentTask.projectId, userId } },
      });
      if (projectMember) return;
    }

    if (parentTask.createdById === userId) return;

    const taskMember = await this.prisma.taskMember.findUnique({
      where: { taskId_userId: { taskId: parentTask.id, userId } },
    });

    if (!taskMember) {
      throw new ForbiddenException('Only task members, the task creator, or the project owner can create subtasks');
    }
  }

  private assertValidDateRange(start?: Date | null, end?: Date | null) {
    if (start && end && start.getTime() > end.getTime()) {
      throw new BadRequestException('dateRangeStart must be on or before dateRangeEnd');
    }
  }

  private async assertUsersAreProjectMembers(projectId: string, userIds: string[]) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    for (const userId of userIds) {
      if (userId === project.ownerId) continue;

      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (!member) {
        throw new BadRequestException(
          `User ${userId} must be a member of this task's project before being assigned to it`,
        );
      }
    }
  }

  private async getOrThrow(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async logActivity(taskId: string, actorId: string, action: string, target?: string) {
    await this.prisma.activity.create({
      data: { taskId, actorId, action: action as any, target },
    });
  }

  private async notifyWatchersOfStatusChange(taskId: string, actorId: string, newStatus: string) {
    const watchers = await this.prisma.taskWatcher.findMany({
      where: { taskId, userId: { not: actorId } },
      select: { userId: true },
    });

    if (!watchers.length) return;

    await this.prisma.notification.createMany({
      data: watchers.map((w) => ({
        recipientId: w.userId,
        actorId,
        type: 'status_change',
        taskId,
        message: `Task status changed to ${newStatus}`,
      })),
    });
  }
}
