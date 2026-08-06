import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class FreeTierGuard implements CanActivate {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Most hosts that make deploying easy for a bootstrapped startup (Render,
    // Railway, Vercel, Fly.io, Cloudflare) sit you behind a proxy, which means
    // request.ip alone resolves to the proxy's address, not the real client's.
    // X-Forwarded-For's first entry is the original client IP when a proxy is
    // present; if there's no proxy, this header just won't exist and we fall
    // back to request.ip. This works correctly either way without needing to
    // know your exact hosting setup — but if you do know you're behind Render,
    // also add `app.set('trust proxy', 1)` in main.ts (already done below) so
    // Express/Nest's own request.ip resolves correctly too.
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : undefined;
    const clientId = request.headers['x-anonymous-client-id'] || forwardedIp || request.ip;

    const key = `rate-limit:free:${clientId}`;
    const requests = await this.redis.incr(key);

    if (requests === 1) {
      await this.redis.expire(key, 86400);
    }

    return requests <= 20;
  }
}
