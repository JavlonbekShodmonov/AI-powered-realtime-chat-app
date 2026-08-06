import { Controller, Get, Query } from '@nestjs/common';
import { HistoryService } from './history.service';

@Controller('api/history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('search')
  async search(@Query('q') query?: string) {
    const results = await this.historyService.searchHistory(query?.trim() || '');
    return { results };
  }
}