import { Controller, Post, Body, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import { InternalAuthGuard } from '../auth/internal-auth.guard';
import { FreeTierGuard } from '../rate-limit/free-tier.guard';
export class SubscribeDto {
  @IsObject()
  @IsNotEmpty({ message: 'Missing push subscription object' })
  subscription: Record<string, any>;

  @IsString()
  @IsNotEmpty({ message: 'Missing verified userId from Next.js' })
  userId: string;
}

// This is the endpoint that was missing entirely. Before this, nothing
// wrote to `user:subscription:${userId}` in Redis, so notification.processor.ts's
// lookup always came back empty and every push notification silently no-op'd.
@Controller('api/subscriptions')
export class SubscriptionsController {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  @Post()
  @UseGuards(InternalAuthGuard, FreeTierGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async subscribe(@Body() body: SubscribeDto) {
    await this.redis.set(`user:subscription:${body.userId}`, JSON.stringify(body.subscription));
    return { success: true, message: 'Subscription saved' };
  }
}
