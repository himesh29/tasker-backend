import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
}

// FIX (#7): guest display id used to be a full randomUUID() embedded in
// the email/name ("guest-<uuid>"). This generates a short, 6-character
// lowercase alphanumeric id instead (e.g. "fhf6rt"), matching the desired
// "guest-fhf6rt" style. The real database primary key (User.id) stays a
// UUID as required by the schema — this short id is purely a
// human-facing label used for the guest's email/name.
function generateShortGuestId(length = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new InternalServerErrorException('GOOGLE_CLIENT_ID is not set');
    }
    this.googleClient = new OAuth2Client(clientId);
  }

  async googleLogin(idToken: string) {
    const ticket = await this.googleClient
      .verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })
      .catch(() => {
        throw new UnauthorizedException('Invalid Google token');
      });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedException('Google token missing email');
    }

    let user = await this.prisma.user.findUnique({ where: { googleId: payload.sub } });

    if (!user) {
      const preProvisioned = await this.prisma.user.findUnique({
        where: { email: payload.email },
      });

      if (preProvisioned) {
        user = await this.prisma.user.update({
          where: { id: preProvisioned.id },
          data: {
            googleId: payload.sub,
            name: preProvisioned.name ?? payload.name ?? payload.email,
            avatarUrl: payload.picture,
          },
        });
      } else {
        // Auto-register brand new Google users so they can log in
        user = await this.prisma.user.create({
          data: {
            email: payload.email,
            name: payload.name ?? payload.email,
            avatarUrl: payload.picture,
            googleId: payload.sub,
          },
        });
      }
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { name: payload.name ?? undefined, avatarUrl: payload.picture ?? undefined },
      });
    }

    return this.issueTokens(user);
  }

  async guestLogin() {
    // FIX (#7): short 6-char id for display, with a retry loop in case of
    // a (very unlikely) collision on the unique `email` column.
    let shortId = generateShortGuestId();
    let guestEmail = `guest-${shortId}@pyramid.local`;

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.prisma.user.findUnique({ where: { email: guestEmail } });
      if (!existing) break;
      shortId = generateShortGuestId();
      guestEmail = `guest-${shortId}@pyramid.local`;
    }

    const user = await this.prisma.user.create({
      data: {
        email: guestEmail,
        name: `Guest-${shortId}`,
        isGuest: true,
        guestExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return this.issueTokens(user);
  }

  async issueTokens(user: { id: string; email: string }) {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken, user: payload };
  }

  async refreshTokens(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    if (user.isGuest && user.guestExpiresAt && user.guestExpiresAt < new Date()) {
      throw new UnauthorizedException('Guest session has expired');
    }
    return this.issueTokens(user);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { ownedProjects: true, projectMemberOf: true },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      ownedProjects: user.ownedProjects,
      projectMemberOf: user.projectMemberOf,
    };
  }
}
