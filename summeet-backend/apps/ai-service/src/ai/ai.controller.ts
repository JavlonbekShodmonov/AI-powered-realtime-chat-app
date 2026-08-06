import { Controller, Post, Get, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PlanService } from './plan.service';

@Controller('api/ai')
export class AIController {
  constructor(
    @InjectQueue('ai-tasks') private readonly aiQueue: Queue,
    private readonly planService: PlanService,
  ) {}

  @Get('plan/:userId')
  async getPlan(@Param('userId') userId: string) {
    const isPaid = await this.planService.isPaid(userId);
    return { isPaid };
  }

  @Post('summarize')
  async triggerSummary(@Body() body: any) {
    const { roomId, userId, trigger = 'end-of-call' } = body;
    if (!roomId) throw new HttpException('roomId is required', HttpStatus.BAD_REQUEST);

    // "live" = on-demand/during-call generation — paid only. Anything else
    // defaults to "end-of-call": free tier's one taste of the feature,
    // always allowed, no trial limit, matches giving freeloaders the full
    // summary once the meeting's actually over.
    if (trigger === 'live') {
      const paid = await this.planService.isPaid(userId);
      if (!paid) {
        throw new HttpException(
          'Live summary generation is a paid feature.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    const job = await this.aiQueue.add('summarize-meeting', body, { attempts: 2 });
    return { message: 'Summary job queued', jobId: job.id };
  }

  @Post('suggest-response')
  async suggestResponse(@Body() body: any) {
    const { roomId, userId } = body;
    if (!roomId || !userId) {
      throw new HttpException('roomId and userId are required', HttpStatus.BAD_REQUEST);
    }

    const paid = await this.planService.isPaid(userId);
    if (!paid) {
      const grantedTrial = await this.planService.consumeSuggestionTrial(userId);
      if (!grantedTrial) {
        throw new HttpException(
          "You've used your free suggestion. Upgrade for unlimited AI suggestions.",
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    const job = await this.aiQueue.add('suggest-response', body, { attempts: 2 });
    return { message: 'Suggestion job queued', jobId: job.id };
  }
}