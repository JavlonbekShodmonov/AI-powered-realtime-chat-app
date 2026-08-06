import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { MeetingSummary, MeetingSummarySchema } from './meeting-summary.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MeetingSummary.name, schema: MeetingSummarySchema },
    ]),
  ],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}