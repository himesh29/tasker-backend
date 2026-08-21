import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

import type {
  Request,
  Response,
} from "express";

import { AuthService } from "./auth.service";
import { GoogleLoginDto } from "./dto/google-login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { CurrentUser } from "./decorators/current-user.decorator";

import type {
  JwtPayload,
} from "./auth.service";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  path: "/auth/refresh",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService
  ) {}

  @Post("google")
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const {
      accessToken,
      refreshToken,
      user,
    } =
      await this.authService.googleLogin(
        dto.idToken
      );

    res.cookie(
      "refresh_token",
      refreshToken,
      REFRESH_COOKIE_OPTIONS
    );

    return {
      accessToken,
      refreshToken,   // 👈 ADD THIS
      user,
    };
  }

  @Post("guest")
  async guestLogin(
    @Res({ passthrough: true }) res: Response
  ) {
    const {
      accessToken,
      refreshToken,
      user,
    } =
      await this.authService.guestLogin();

    res.cookie(
      "refresh_token",
      refreshToken,
      REFRESH_COOKIE_OPTIONS
    );

    return {
      accessToken,
      refreshToken,   
      user,
    };
  }

  @UseGuards(JwtRefreshGuard)
  @Post("refresh")
  async refresh(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response
  ) {
    const {
      accessToken,
      refreshToken,
      user: payload,
    } =
      await this.authService.refreshTokens(
        user.sub
      );

    res.cookie(
      "refresh_token",
      refreshToken,
      REFRESH_COOKIE_OPTIONS
    );

    return {
      accessToken,
      refreshToken,   
      user: payload,
    };
  }

  @Post("logout")
  async logout(
    @Res({ passthrough: true }) res: Response
  ) {
    res.clearCookie(
      "refresh_token",
      {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/auth/refresh",
      }
    );

    return {
      success: true,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(
    @CurrentUser() user: JwtPayload
  ) {
    return this.authService.getProfile(
      user.sub
    );
  }
}
