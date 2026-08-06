import { Controller, Post, Body, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FreeTierGuard } from './rate-limit/free-tier.guard';
import { InternalAuthGuard } from './auth/internal-auth.guard';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, ValidateIf } from 'class-validator';

// Matches exactly what AIProcessor.handleSummarize actually reads from job.data.
// `text` was dropped — the processor re-fetches messages from Mongo by roomId
// and never read a raw `text` field, so requiring it from clients was dead weight.
//
// userId is now optional and comes from Next.js (already verified via NextAuth),
// not from the client body directly — see AppController below.
export class SummarizeDto {
  @IsString()
  @IsNotEmpty({ message: 'Missing room tracking ID' })
  roomId: string;

  @IsOptional()
  @IsBoolean()
  isVideoCall?: boolean;

  @IsOptional()
  @IsNumber()
  callStartTime?: number;

  @IsOptional()
  @IsNumber()
  callEndTime?: number;

  @IsOptional()
  @IsString()
  overrideLanguage?: string;
}

// Supports both suggestion modes your old system had:
//  - roomId-based: pulls recent room messages from Mongo, uses cache + fallback
//  - contextText-based: caller supplies the conversation text directly (no DB lookup)
// Exactly one of the two must be provided.
export class SuggestResponseDto {
  @ValidateIf((o) => !o.contextText)
  @IsString()
  @IsNotEmpty({ message: 'Either roomId or contextText is required' })
  roomId?: string;

  @ValidateIf((o) => !o.contextText)
  @IsOptional()
  lastMessagesCount?: number;

  @ValidateIf((o) => !o.roomId)
  @IsString()
  @IsNotEmpty({ message: 'Either roomId or contextText is required' })
  contextText?: string;
}

// Body shape Next.js sends alongside the DTOs above — the verified userId and
// display name, since api-gateway itself has no session/JWT verification.
export class RequestingUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Missing verified userId from Next.js' })
  userId: string;

  @IsOptional()
  @IsString()
  userName?: string;
}

@Controller('api')
export class AppController {
  constructor(@InjectQueue('ai-tasks') private readonly aiQueue: Queue) {}

  @Post('summarize')
  @UseGuards(InternalAuthGuard, FreeTierGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async handleSummarize(@Body() body: SummarizeDto & RequestingUserDto) {
    // Passing userId through triggers the "individual summary" behavior in
    // handleSummarize; omitting it (pass null explicitly, or a separate
    // "whole room" request with no userId) triggers the full-room summary.
    // Your frontend decides which mode by whether it includes userId — for a
    // true "give me both" request, call this endpoint twice: once with
    // userId, once without.
    const job = await this.aiQueue.add('summarize', {
      roomId: body.roomId,
      userId: body.userId,
      isVideoCall: body.isVideoCall ?? false,
      callStartTime: body.callStartTime,
      callEndTime: body.callEndTime,
      overrideLanguage: body.overrideLanguage,
    });

    return { success: true, message: 'Processing scheduled', jobId: job.id };
  }

  @Post('suggest-response')
  @UseGuards(InternalAuthGuard, FreeTierGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async handleSuggestResponse(@Body() body: SuggestResponseDto & RequestingUserDto) {
    const job = await this.aiQueue.add('suggest-response', {
      roomId: body.roomId,
      contextText: body.contextText,
      lastMessagesCount: body.lastMessagesCount,
      userId: body.userId,
      userName: body.userName,
    });

    return { success: true, message: 'Suggestion processing scheduled', jobId: job.id };
  }
}
