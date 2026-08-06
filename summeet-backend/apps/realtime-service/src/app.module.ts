import { Module } from "@nestjs/common";
import {ConfigModule} from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { NotificationProcessor } from "./notification/notification.processor";
import { RealtimeGateway } from "./notification/realtime.gateway";
import { RedisModule } from "@nestjs-modules/ioredis";
import { MeetingSummary, MeetingSummarySchema } from "./history/meeting-summary.schema";
import { MongooseModule } from "@nestjs/mongoose";
@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    MongooseModule.forRoot(process.env.MONGODB_URI),
    MongooseModule.forFeature([
      { name: MeetingSummary.name, schema: MeetingSummarySchema },
    ]),
    // IMPORTANT: use ONE connection source of truth. Previously this used
    // REDIS_URL here but REDIS_HOST/PORT/PASSWORD in the BullMQ block below
    // — if only one set of env vars is actually configured in your deploy
    // environment, these two silently point at different Redis instances.
    // Set REDIS_URL everywhere (ai-service, api-gateway, realtime-service,
    // and Next.js) and make sure it's the exact same value in all of them.
    RedisModule.forRoot({
      type: "single",
      url: process.env.REDIS_URL || "redis://localhost:6379",
    }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || "redis://localhost:6379",
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times: number) => Math.min(times * 200, 3000),
      },
    }),
    // This registration was missing. @Processor('notification-queue') needs
    // the queue registered in this module's imports for BullMQ to actually
    // instantiate a Worker for it — without this, NotificationProcessor may
    // fail to bootstrap or silently never attach.
    BullModule.registerQueue({ name: "notification-queue" }),
  ],
  providers: [RealtimeGateway, NotificationProcessor],
})
export class AppModule {}
