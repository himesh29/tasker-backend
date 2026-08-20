import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage.service';

@Injectable()
export class GuestCleanupService {
  private readonly logger = new Logger(GuestCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async purgeExpiredGuests() {
    const expiredGuests = await this.prisma.user.findMany({
      where: { isGuest: true, guestExpiresAt: { lt: new Date() } },
      select: { id: true, avatarStorageKey: true },
    });

    if (!expiredGuests.length) return;

    const guestIds = expiredGuests.map((g) => g.id);

    const standaloneTaskAttachments = await this.prisma.attachment.findMany({
      where: {
        task: { createdById: { in: guestIds }, projectId: null },
        type: 'file',
        storageKey: { not: null },
      },
      select: { storageKey: true },
    });

    const ownedProjects = await this.prisma.project.findMany({
      where: { ownerId: { in: guestIds } },
      select: { id: true },
    });
    const ownedProjectIds = ownedProjects.map((p) => p.id);

    const projectAttachments = ownedProjectIds.length
      ? await this.prisma.attachment.findMany({
          where: {
            task: { projectId: { in: ownedProjectIds } },
            type: 'file',
            storageKey: { not: null },
          },
          select: { storageKey: true },
        })
      : [];

    await this.prisma.task.deleteMany({
      where: { createdById: { in: guestIds }, projectId: null },
    });

    await this.prisma.project.deleteMany({
      where: { ownerId: { in: guestIds } },
    });

    const { count } = await this.prisma.user.deleteMany({
      where: { id: { in: guestIds } },
    });

    const storageKeysToDelete = [
      ...standaloneTaskAttachments.map((a) => a.storageKey),
      ...projectAttachments.map((a) => a.storageKey),
      ...expiredGuests.map((g) => g.avatarStorageKey),
    ].filter((key): key is string => !!key);

    for (const storageKey of storageKeysToDelete) {
      await this.storage.deleteFile(storageKey).catch(() =>
        this.logger.warn(`Failed to clean up orphaned file for expired guest: ${storageKey}`),
      );
    }

    if (count > 0) {
      this.logger.log(`Purged ${count} expired guest account(s)`);
    }
  }
}
