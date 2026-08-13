import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@CurrentUser() creator: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(creator, dto);
  }

  @Get()
  findAll(@CurrentUser() actor: JwtPayload, @Query() query: ProjectQueryDto) {
    return this.projectsService.findAll(actor, query);
  }

  @Get(':id')
  findOne(@CurrentUser() actor: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.findOne(actor, id);
  }

  @Get(':id/delete-summary')
  getDeleteSummary(@CurrentUser() actor: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.getDeleteSummary(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(actor, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.remove(actor, id);
  }

  @Post(':id/members/:userId')
  addMember(
    @CurrentUser() addedBy: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.projectsService.addMember(id, userId, addedBy);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @CurrentUser() removedBy: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.projectsService.removeMember(id, userId, removedBy);
  }
}
