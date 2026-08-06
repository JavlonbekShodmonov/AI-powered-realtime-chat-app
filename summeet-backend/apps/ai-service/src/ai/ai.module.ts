import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AIService } from './ai.service';
import { AIProcessor } from './ai.processor';
import { AIController } from './ai.controller';
import { SpeechTranscriptsController } from './speech-transcripts.controller';
import { SpeechTranscriptsService } from './speech-transcripts.service';
import { PlanService } from './plan.service';
import { MeetingSummary, MeetingSummarySchema } from '../history/meeting-summary.schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MeetingSummary.name, schema: MeetingSummarySchema }]),
    BullModule.registerQueue(
      { name: 'ai-tasks' },
      { name: 'notification-queue' },
    ),
  ],
  controllers: [AIController, SpeechTranscriptsController],
  providers: [AIService, AIProcessor, SpeechTranscriptsService, PlanService],
  exports: [AIService],
})
export class AIModule {}