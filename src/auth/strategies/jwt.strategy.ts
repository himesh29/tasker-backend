import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // FIX: access tokens live for 15 minutes and this previously trusted the
  // signature alone — a deleted user (or a guest whose account expired but
  // hasn't been swept by GuestCleanupService's 10-minute cron yet) could
  // keep making authenticated requests until the token itself expired.
  // Since Project.owner is now `onDelete: Cascade` (see schema.prisma),
  // an already-deleted user's stale token could otherwise still trigger
  // writes referencing an id that no longer exists. One extra indexed
  // lookup per request is a reasonable cost for closing that window.
  //
  // Whatever this returns becomes `req.user`.
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isGuest: true, guestExpiresAt: true },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    if (user.isGuest && user.guestExpiresAt && user.guestExpiresAt < new Date()) {
      throw new UnauthorizedException('Guest session has expired');
    }

    return payload;
  }
}

