// FILE: src/attachments/attachments.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { AttachmentsService } from './attachments.service';
import { CreateLinkAttachmentDto } from './dto/create-link-attachment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
]);

function attachmentFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(
      new BadRequestException(
        'Unsupported file type. Allowed: PDF, Word, Excel, PowerPoint, text/CSV, common images, and zip.',
      ),
      false,
    );
    return;
  }
  cb(null, true);
}

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: attachmentFileFilter,
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async uploadFile(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() actor: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided, or the file type is not allowed');
    return this.attachmentsService.createFile(taskId, actor, file);
  }

  @Post('link')
  createLink(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: CreateLinkAttachmentDto,
  ) {
    return this.attachmentsService.createLink(taskId, actor, dto);
  }

  @Get()
  findAll(@Param('taskId', ParseUUIDPipe) taskId: string, @CurrentUser() actor: JwtPayload) {
    return this.attachmentsService.findAllForTask(taskId, actor);
  }

  @Delete(':id')
  remove(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.attachmentsService.remove(taskId, id, actor);
  }
}
