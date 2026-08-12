// FILE: src/users/users.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

// FIX (#9): mirrors the existing attachments upload restrictions
// (ALLOWED_EXTENSIONS / ALLOWED_MIME_TYPES pattern in
// attachments.controller.ts) but scoped to images only, since this is an
// avatar upload endpoint.
const AVATAR_UPLOADS_DIR = 'uploads/avatars';
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const ALLOWED_AVATAR_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

function avatarFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_AVATAR_EXTENSIONS.has(ext) || !ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
    cb(
      new BadRequestException('Unsupported file type. Allowed: PNG, JPG, GIF, WEBP.'),
      false,
    );
    return;
  }
  cb(null, true);
}

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@CurrentUser() creator: JwtPayload, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(creator, dto);
  }

  @Get()
  findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.usersService.findOne(id, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, actor, dto);
  }

  // FIX (#9): new avatar upload endpoint, mirroring the attachments
  // FileInterceptor pattern. Self-only, same as the rest of this
  // controller — works for guests too since there's no isGuest check.
  @Post(':id/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: AVATAR_UPLOADS_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: avatarFileFilter,
      limits: { fileSize: MAX_AVATAR_SIZE_BYTES },
    }),
  )
  async uploadAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (actor.sub !== id) {
      throw new ForbiddenException('You can only update your own avatar');
    }
    if (!file) {
      throw new BadRequestException('No file provided, or the file type is not allowed (field name must be "file")');
    }
    return this.usersService.updateAvatar(id, actor, file);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.usersService.deleteUser(id, actor);
  }
}
