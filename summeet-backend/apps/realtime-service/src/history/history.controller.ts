import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MeetingSummary } from './meeting-summary.schema';

@Controller('history')
export class HistoryController {
  constructor(
    @InjectModel(MeetingSummary.name) private readonly summaryModel: Model<MeetingSummary>
  ) {}

  @Get('search')
  async searchHistory(@Req() req, @Query('q') query: string) {
    const userId = req.user.id;
    const searchFilter = query
      ? { userId, $text: { $search: query } }
      : { userId };

    return this.summaryModel
      .find(searchFilter)
      .sort({ createdAt: -1 })
      .select('meetingId topics decisions actionItems participation createdAt')
      .limit(50)
      .exec();
  }
}