// FILE: src/common/task-access.service.ts
//
// FIX (#10): assertCanViewTask / assertCanManageTask were copy-pasted,
// byte-for-byte identical, across TasksService, CommentsService and
// AttachmentsService. That's a bug waiting to happen — a rule fixed in
// one copy (e.g. the #10/#15 fixes referenced in comments.controller.ts /
// attachments.controller.ts) can silently stay broken in the others.
// This is now the single source of truth; all three modules delegate here.
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaskAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws NotFoundException (never Forbidden) when the user can't see the
   * task, so we don't leak the existence of tasks the user has no access to.
   */
  async assertCanView(userId: string, task: { id: string; projectId: string | null; createdById: string | null }) {
    if (task.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: task.projectId },
        select: { ownerId: true },
      });

      if (!project) throw new NotFoundException('Project not found');
      if (project.ownerId === userId) return;

      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: task.projectId, userId } },
      });
      if (!member) throw new NotFoundException('Task not found');
      return;
    }

    if (task.createdById === userId) return;

    const [isMember, isWatcher] = await Promise.all([
      this.prisma.taskMember.findUnique({ where: { taskId_userId: { taskId: task.id, userId } } }),
      this.prisma.taskWatcher.findUnique({ where: { taskId_userId: { taskId: task.id, userId } } }),
    ]);

    if (!isMember && !isWatcher) throw new NotFoundException('Task not found');
  }

  /** Task creator or the owning project's owner. */
  async assertCanManage(userId: string, task: { createdById: string | null; projectId: string | null }) {
    if (task.createdById === userId) return;

    if (task.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: task.projectId },
        select: { ownerId: true },
      });
      if (project?.ownerId === userId) return;
    }

    throw new ForbiddenException('Only the task creator or project owner can perform this action');
  }
}
