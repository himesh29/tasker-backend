import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAccessService } from '../common/task-access.service';
import { JwtPayload } from '../auth/auth.service';
import { CreateLinkAttachmentDto } from './dto/create-link-attachment.dto';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  async createFile(taskId: string, actor: JwtPayload, file: Express.Multer.File) {
    // FIX (#5): multer's diskStorage already wrote `file` to disk before this
    // method ever runs (the interceptor executes ahead of the controller
    // body). If any check below throws — task not found, no view access,
    // task locked — the upload was still accepted onto disk with nothing in
    // the DB pointing at it. Wrap the checks so a rejected upload always
    // gets its file cleaned up instead of leaking forever.
    try {
      const task = await this.getTaskOrThrow(taskId);
      await this.taskAccess.assertCanView(actor.sub, task);

      if (task.isLocked) {
        throw new ForbiddenException('Task is locked');
      }

      const attachment = await this.prisma.attachment.create({
        data: {
          taskId,
          type: 'file',
          name: file.originalname,
          url: `/uploads/${file.filename}`,
          storageKey: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedById: actor.sub,
        },
      });

      await this.prisma.activity.create({
        data: {
          taskId,
          actorId: actor.sub,
          action: 'updated',
          target: `attached ${file.originalname}`,
        },
      });

      return attachment;
    } catch (err) {
      await unlink(join(UPLOADS_DIR, file.filename)).catch(() =>
        this.logger.warn(`Failed to clean up orphaned upload: ${file.filename}`),
      );
      throw err;
    }
  }

  async createLink(taskId: string, actor: JwtPayload, dto: CreateLinkAttachmentDto) {
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanView(actor.sub, task);

    if (task.isLocked) {
      throw new ForbiddenException('Task is locked');
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        taskId,
        type: 'link',
        name: dto.name,
        url: dto.url,
        uploadedById: actor.sub,
      },
    });

    await this.prisma.activity.create({
      data: {
        taskId,
        actorId: actor.sub,
        action: 'updated',
        target: `linked ${dto.name}`,
      },
    });

    return attachment;
  }

  async findAllForTask(taskId: string, actor: JwtPayload) {
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanView(actor.sub, task);

    return this.prisma.attachment.findMany({
      where: { taskId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(taskId: string, id: string, actor: JwtPayload) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment || attachment.taskId !== taskId) {
      throw new NotFoundException('Attachment not found');
    }

    const task = await this.getTaskOrThrow(taskId);

    if (task.isLocked) {
      throw new ForbiddenException('Task is locked');
    }

    if (attachment.uploadedById !== actor.sub) {
      await this.taskAccess.assertCanManage(actor.sub, task);
    }

    if (attachment.type === 'file' && attachment.storageKey) {
      await unlink(join(UPLOADS_DIR, attachment.storageKey)).catch(() => undefined);
    }

    return this.prisma.attachment.delete({ where: { id } });
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // FIX (#10): view/manage permission checks now live in TaskAccessService
  // (see src/common/task-access.service.ts) instead of being duplicated here.
}

