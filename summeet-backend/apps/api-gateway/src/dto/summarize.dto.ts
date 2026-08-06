import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SummarizeDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
