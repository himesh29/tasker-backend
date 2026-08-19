// FILE: src/users/users.service.ts
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { JwtPayload } from '../auth/auth.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async createUser(creator: JwtPayload, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ForbiddenException('A user with this email already exists');

    return this.prisma.user.create({
      data: { email: dto.email, name: dto.name, createdById: creator.sub },
    });
  }

  async findAll(query: UserQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 1000;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, actor: JwtPayload) {
    if (actor.sub !== id) throw new ForbiddenException('You can only view your own profile');

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { ownedProjects: true, projectMemberOf: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUser(id: string, actor: JwtPayload, dto: UpdateUserDto) {
    if (actor.sub !== id) throw new ForbiddenException('You can only update your own profile');

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: { name: dto.name, avatarUrl: dto.avatarUrl },
    });
  }

  async updateAvatar(id: string, actor: JwtPayload, file: Express.Multer.File) {
    if (actor.sub !== id) throw new ForbiddenException('You can only update your own avatar');

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const r2BaseUrl = process.env.R2_PUBLIC_URL!;
    const previousStorageKey = target.avatarUrl?.startsWith(r2BaseUrl) 
      ? target.avatarUrl.replace(`${r2BaseUrl}/`, '') 
      : null;

    const { url, storageKey } = await this.storage.uploadFile(file, 'avatars');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { avatarUrl: url },
    });

    if (previousStorageKey) {
      await this.storage.deleteFile(previousStorageKey);
    }

    return updated;
  }

  async deleteUser(id: string, actor: JwtPayload) {
    if (actor.sub !== id) throw new ForbiddenException('You can only delete your own account');

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const standaloneTaskAttachments = await this.prisma.attachment.findMany({
      where: { task: { createdById: id, projectId: null }, type: 'file', storageKey: { not: null } },
      select: { storageKey: true },
    });

    await this.prisma.task.deleteMany({
      where: { createdById: id, projectId: null },
    });

    for (const att of standaloneTaskAttachments) {
      if (att.storageKey) await this.storage.deleteFile(att.storageKey);
    }

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
          where: { task: { projectId: { in: orphanedProjectIds } }, type: 'file', storageKey: { not: null } },
          select: { storageKey: true },
        })
      : [];

    await this.prisma.user.delete({ where: { id } });

    for (const att of orphanedProjectAttachments) {
      if (att.storageKey) await this.storage.deleteFile(att.storageKey);
    }

    return { id, deleted: true };
  }
}
