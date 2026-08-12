import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { JwtPayload } from '../auth/auth.service';

const UPLOADS_DIR = join(process.cwd(), 'uploads');
const AVATAR_UPLOADS_DIR = join(process.cwd(), 'uploads', 'avatars');

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createUser(creator: JwtPayload, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ForbiddenException('A user with this email already exists');
    }

    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        createdById: creator.sub,
      },
    });
  }

  async findAll(query: UserQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 1000;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, actor: JwtPayload) {
    if (actor.sub !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        ownedProjects: true,
        projectMemberOf: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(id: string, actor: JwtPayload, dto: UpdateUserDto) {
    if (actor.sub !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl,
      },
    });
  }

  // FIX (#9): new avatar upload flow, following the same "clean up the
  // file on disk if the DB write fails" pattern used in
  // attachments.service.ts's createFile(). Deletes the previous avatar
  // file from disk (if it was one of ours, i.e. under /uploads/avatars)
  // once the new one is committed, so orphaned avatar files don't pile up.
  async updateAvatar(id: string, actor: JwtPayload, file: Express.Multer.File) {
    if (actor.sub !== id) {
      throw new ForbiddenException('You can only update your own avatar');
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      await unlink(join(AVATAR_UPLOADS_DIR, file.filename)).catch(() =>
        this.logger.warn(`Failed to clean up orphaned avatar upload: ${file.filename}`),
      );
      throw new NotFoundException('User not found');
    }

    const previousAvatarUrl = target.avatarUrl;
    const newAvatarUrl = `/uploads/avatars/${file.filename}`;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { avatarUrl: newAvatarUrl },
    });

    if (previousAvatarUrl && previousAvatarUrl.startsWith('/uploads/avatars/')) {
      const previousFilename = previousAvatarUrl.replace('/uploads/avatars/', '');
      await unlink(join(AVATAR_UPLOADS_DIR, previousFilename)).catch(() =>
        this.logger.warn(`Failed to clean up previous avatar: ${previousFilename}`),
      );
    }

    return updated;
  }

  async deleteUser(id: string, actor: JwtPayload) {
  if (actor.sub !== id) {
    throw new ForbiddenException('You can only delete your own account');
  }

  const target = await this.prisma.user.findUnique({ where: { id } });
  if (!target) throw new NotFoundException('User not found');

  // --- NEW: collect attachments from standalone tasks ---
  const standaloneTaskAttachments = await this.prisma.attachment.findMany({
    where: {
      task: {
        createdById: id,
        projectId: null,
      },
      type: 'file',
      storageKey: { not: null },
    },
    select: { storageKey: true },
  });

  // Delete standalone tasks
  await this.prisma.task.deleteMany({
    where: { createdById: id, projectId: null },
  });

  // Remove physical files for standalone task attachments
  for (const att of standaloneTaskAttachments) {
    if (att.storageKey) {
      await unlink(join(UPLOADS_DIR, att.storageKey)).catch(() =>
        this.logger.warn(`Failed to clean up orphaned file: ${att.storageKey}`),
      );
    }
  }

  // --- Existing project handover & cleanup (unchanged) ---
  const ownedProjects = await this.prisma.project.findMany({
    where: { ownerId: id },
    select: { id: true },
  });

  const orphanedProjectIds: string[] = [];

  for (const project of ownedProjects) {
    const nextOwner = await this.prisma.projectMember.findFirst({
      where: { projectId: project.id, userId: { not: id } },
      orderBy: { addedAt: 'asc' },
    });

    if (nextOwner) {
      await this.prisma.$transaction([
        this.prisma.project.update({
          where: { id: project.id },
          data: { ownerId: nextOwner.userId },
        }),
        this.prisma.projectMember.delete({
          where: { projectId_userId: { projectId: project.id, userId: nextOwner.userId } },
        }),
      ]);
    } else {
      orphanedProjectIds.push(project.id);
    }
  }

  const orphanedProjectAttachments = orphanedProjectIds.length
    ? await this.prisma.attachment.findMany({
        where: {
          task: { projectId: { in: orphanedProjectIds } },
          type: 'file',
          storageKey: { not: null },
        },
        select: { storageKey: true },
      })
    : [];

  await this.prisma.user.delete({ where: { id } });

  for (const att of orphanedProjectAttachments) {
    if (att.storageKey) {
      await unlink(join(UPLOADS_DIR, att.storageKey)).catch(() =>
        this.logger.warn(`Failed to clean up orphaned file: ${att.storageKey}`),
      );
    }
  }

  return { id, deleted: true };
}
}
