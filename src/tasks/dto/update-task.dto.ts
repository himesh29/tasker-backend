// FILE: src/tasks/dto/update-task.dto.ts
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PriorityDto } from '../../projects/dto/create-project.dto';

export enum TaskStatusDto {
  TODO = 'todo',
  DOING = 'doing',
  COMPLETED = 'completed',
  ON_HOLD = 'on_hold',
}

export class UpdateTaskDto {
  // FIX (#8): CreateTaskDto requires a non-empty title; this DTO didn't,
  // so `PATCH /tasks/:id { "title": "" }` could silently blank out a task's
  // title. summary/description get the same treatment for consistency —
  // if you're sending the field, send a real value; omit it to leave it
  // untouched.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  summary?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;
  
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsEnum(TaskStatusDto)
  status?: TaskStatusDto;

  @IsOptional()
  @IsEnum(PriorityDto)
  priority?: PriorityDto;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  dateRangeStart?: string;

  @IsOptional()
  @IsDateString()
  dateRangeEnd?: string;

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @IsOptional()
  @IsUUID()
  reporterId?: string | null;
}

