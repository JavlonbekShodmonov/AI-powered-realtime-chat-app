import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AppController } from './app.controller';
import { FreeTierGuard } from './rate-limit/free-tier.guard';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PaymentsModule } from './payments/payments.module';
import { HistoryModule } from 'apps/api-gateway/src/history/history.module';
import {MongooseModule} from "@nestjs/mongoose";
import { HealthController } from './health/health.controller';
// NotificationModule / NotificationGateway / NotificationProcessor were
// removed from here. api-gateway should only ever produce jobs, never
// consume 'notification-queue' — realtime-service already owns that
// consumer, and having two workers on the same queue meant jobs were
// randomly split between a complete implementation and an incomplete one.
@Module({
  imports: [
    RedisModule.forRoot({
      type: 'single',
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times: number) => Math.min(times * 200, 3000),
      },
    }),
    BullModule.registerQueue({ name: 'ai-tasks' }),
    MongooseModule.forRoot(process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/summeet', {
      autoIndex: true,
    }),
    SubscriptionsModule,
    PaymentsModule,
    HistoryModule,
  ],
  controllers: [AppController, HealthController],
  providers: [FreeTierGuard],
})
export class AppModule {}
