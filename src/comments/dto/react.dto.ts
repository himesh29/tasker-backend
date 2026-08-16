import { IsNotEmpty, IsString } from 'class-validator';

export class ReactDto {
  @IsString()
  @IsNotEmpty()
  emoji: string;
}

