import { ArrayUnique, IsArray, IsOptional, IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  // User ids mentioned in the comment (frontend resolves @name -> id
  // as the person types, same pattern as Slack/Linear).
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  mentionedUserIds?: string[];
}

