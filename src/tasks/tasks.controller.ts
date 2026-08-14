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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignMembersDto } from './dto/assign-members.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@CurrentUser() creator: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(creator, dto);
  }

  @Get()
  findAll(@CurrentUser() actor: JwtPayload, @Query() query: TaskQueryDto) {
    return this.tasksService.findAll(actor, query);
  }

  @Get(':id')
  findOne(@CurrentUser() actor: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.findOne(actor, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(id, actor, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.tasksService.remove(id, actor);
  }

  @Post(':id/members')
  addMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignMembersDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tasksService.addMembers(id, dto.userIds, actor);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.tasksService.removeMember(id, userId, actor);
  }

  @Post(':id/watch')
  watch(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.tasksService.watch(id, actor.sub);
  }

  @Delete(':id/watch')
  unwatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.tasksService.unwatch(id, actor.sub);
  }
}
