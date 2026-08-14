// FILE: src/tasks/dto/create-task.dto.ts
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PriorityDto } from '../../projects/dto/create-project.dto';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

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
  @IsUUID()
  reporterId?: string;
}
