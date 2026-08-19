// FILE: src/attachments/attachments.service.ts
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAccessService } from '../common/task-access.service';
import { StorageService } from '../common/storage.service';
import { JwtPayload } from '../auth/auth.service';
import { CreateLinkAttachmentDto } from './dto/create-link-attachment.dto';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccess: TaskAccessService,
    private readonly storage: StorageService,
  ) {}

  async createFile(taskId: string, actor: JwtPayload, file: Express.Multer.File) {
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanView(actor.sub, task);

    if (task.isLocked) {
      throw new ForbiddenException('Task is locked');
    }

    const { url, storageKey } = await this.storage.uploadFile(file, 'attachments');

    try {
      const attachment = await this.prisma.attachment.create({
        data: {
          taskId,
          type: 'file',
          name: file.originalname,
          url,
          storageKey,
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
      await this.storage.deleteFile(storageKey);
      throw err;
    }
  }

  async createLink(taskId: string, actor: JwtPayload, dto: CreateLinkAttachmentDto) {
    const task = await this.getTaskOrThrow(taskId);
    await this.taskAccess.assertCanView(actor.sub, task);

    if (task.isLocked) throw new ForbiddenException('Task is locked');

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
      data: { taskId, actorId: actor.sub, action: 'updated', target: `linked ${dto.name}` },
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
    if (task.isLocked) throw new ForbiddenException('Task is locked');

    if (attachment.uploadedById !== actor.sub) {
      await this.taskAccess.assertCanManage(actor.sub, task);
    }

    if (attachment.type === 'file' && attachment.storageKey) {
      await this.storage.deleteFile(attachment.storageKey);
    }

    return this.prisma.attachment.delete({ where: { id } });
  }

  private async getTaskOrThrow(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }
}
