// FILE: src/projects/projects.service.ts
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage.service';
import { JwtPayload } from '../auth/auth.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async create(creator: JwtPayload, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        priority: dto.priority as any,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        ownerId: creator.sub,
        createdById: creator.sub,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
  }

  async findAll(actor: JwtPayload, query: ProjectQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 500;
    const skip = (page - 1) * limit;

    const permissionFilter = {
      OR: [{ ownerId: actor.sub }, { members: { some: { userId: actor.sub } } }],
    };

    const where = { AND: [permissionFilter] };

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { tasks: true, members: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(actor: JwtPayload, id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { tasks: true } },
      },
    });

    if (!project) throw new NotFoundException('Project not found');
    await this.assertCanAccessProject(actor.sub, id);

    return project;
  }

  async getDeleteSummary(actor: JwtPayload, id: string) {
    await this.assertCanAccessProject(actor.sub, id);

    const [total, completed] = await Promise.all([
      this.prisma.task.count({ where: { projectId: id } }),
      this.prisma.task.count({ where: { projectId: id, status: 'completed' } }),
    ]);

    return { total, completed, ongoing: total - completed };
  }

  async update(actor: JwtPayload, id: string, dto: UpdateProjectDto) {
    await this.ensureOwner(id, actor.sub);

    return this.prisma.project.update({
      where: { id },
      data: {
        name: dto.name,
        priority: dto.priority as any,
        dueDate: dto.dueDate === undefined ? undefined : (dto.dueDate === null ? null : new Date(dto.dueDate)),
      },
    });
  }

  async remove(actor: JwtPayload, id: string) {
    await this.ensureOwner(id, actor.sub);

    const attachments = await this.prisma.attachment.findMany({
      where: { task: { projectId: id }, type: 'file', storageKey: { not: null } },
      select: { storageKey: true },
    });

    const deletedProject = await this.prisma.project.delete({ where: { id } });

    for (const att of attachments) {
      if (att.storageKey) {
        await this.storage.deleteFile(att.storageKey);
      }
    }

    return deletedProject;
  }

  async addMember(projectId: string, userId: string, addedBy: JwtPayload) {
    await this.ensureOwner(projectId, addedBy.sub);
    await this.ensureUserExists(userId);

    return this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: {},
      create: { projectId, userId, addedById: addedBy.sub },
    });
  }

  async removeMember(projectId: string, userId: string, removedBy: JwtPayload) {
    await this.ensureOwner(projectId, removedBy.sub);

    return this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  private async assertCanAccessProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId === userId) return;

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!member) throw new NotFoundException('Project not found');
  }

  private async ensureOwner(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId !== userId) {
      throw new ForbiddenException('Only the project owner can perform this action');
    }

    return project;
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
