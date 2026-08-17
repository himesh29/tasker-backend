import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateLinkAttachmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUrl()
  url: string;
}

