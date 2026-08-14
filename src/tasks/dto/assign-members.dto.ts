import { ArrayNotEmpty, IsUUID } from 'class-validator';

export class AssignMembersDto {
  @IsUUID('4', { each: true })
  @ArrayNotEmpty()
  userIds: string[];
}

