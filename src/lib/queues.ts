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
const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };

export const notificationQueue = new Queue('notification-queue', { connection });
