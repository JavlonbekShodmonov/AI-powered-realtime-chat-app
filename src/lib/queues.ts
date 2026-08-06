import { Queue } from 'bullmq';

// Next.js is a Node process too, so for internal, non-cost-sensitive jobs
// (like appointment notifications) it can enqueue directly to BullMQ rather
// than going through api-gateway's HTTP layer. api-gateway's HTTP path is
// still the right place for anything that needs rate limiting (the AI
// endpoints, since those cost real Gemini API money) — this direct route is
// for internal, free, structural events only.
//
// IMPORTANT: REDIS_URL here must be the exact same value used by
// ai-service / api-gateway / realtime-service, or jobs enqueued here will
// never be seen by their workers.
const configuredRedisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || process.env.KV_URL || '';
const isBuildOrVercel = Boolean(
  process.env.VERCEL ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.CI
);
const connection = {
  url: isBuildOrVercel ? '' : configuredRedisUrl || 'redis://localhost:6379',
};

class SafeQueue {
  private queue: Queue | null = null;

  constructor(private readonly name: string, private readonly options: { connection: { url: string } }) {
    if (process.env.NODE_ENV === 'test' || !options.connection.url || isBuildOrVercel) {
      return;
    }

    try {
      this.queue = new Queue(name, options);
    } catch (error) {
      console.warn('BullMQ queue initialization failed, notifications will be disabled:', error);
    }
  }

  async add(jobName: string, data: unknown) {
    if (!this.queue) {
      return null;
    }

    try {
      return await this.queue.add(jobName, data);
    } catch (error) {
      console.warn(`Failed to enqueue ${jobName} job:`, error);
      return null;
    }
  }
}

export const notificationQueue = new SafeQueue('notification-queue', { connection });
