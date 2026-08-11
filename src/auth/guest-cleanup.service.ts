import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GuestCleanupService {
  private readonly logger = new Logger(GuestCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async purgeExpiredGuests() {
    const expiredGuests = await this.prisma.user.findMany({
      where: { isGuest: true, guestExpiresAt: { lt: new Date() } },
      select: { id: true },
    });

    if (!expiredGuests.length) return;

    const guestIds = expiredGuests.map((g) => g.id);

    // 1. Delete standalone tasks (no project) created by guests
    await this.prisma.task.deleteMany({
      where: { createdById: { in: guestIds }, projectId: null },
    });

    // 2. Delete all projects owned by these guests
    //    Cascades will remove all tasks, attachments, members, etc.
    await this.prisma.project.deleteMany({
      where: { ownerId: { in: guestIds } },
    });

    // 3. Now delete the guest users
    const { count } = await this.prisma.user.deleteMany({
      where: { id: { in: guestIds } },
    });

    if (count > 0) {
      this.logger.log(`Purged ${count} expired guest account(s)`);
    }
  }
}
