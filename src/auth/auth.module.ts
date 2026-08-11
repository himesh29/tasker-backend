import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GuestCleanupService } from './guest-cleanup.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})], // secrets are passed per-sign/verify call, not globally
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, GuestCleanupService],
  exports: [AuthService],
})
export class AuthModule {}

