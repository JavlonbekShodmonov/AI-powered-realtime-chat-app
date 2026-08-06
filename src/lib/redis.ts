import Redis from "ioredis";

const configuredRedisUrl =
  process.env.REDIS_URL ||
  process.env.UPSTASH_REDIS_URL ||
  process.env.KV_URL ||
  "";

const isBuildOrVercel = Boolean(
  process.env.VERCEL ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.CI
);

const redisUrl = isBuildOrVercel ? "" : configuredRedisUrl || "redis://localhost:6379";

class RedisClientWrapper {
  private client: Redis | null = null;
  private connecting: Promise<Redis | null> | null = null;

  private async getClient(): Promise<Redis | null> {
    if (!redisUrl || isBuildOrVercel) {
      return null;
    }

    if (this.client) {
      return this.client;
    }

    if (!this.connecting) {
      this.connecting = this.createClient();
    }

    return this.connecting;
  }

  private async createClient(): Promise<Redis | null> {
    try {
      const client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2000,
        commandTimeout: 2000,
      });

      client.on("error", (error) => {
        console.warn("Redis unavailable, continuing without it:", error.message);
      });

      try {
        await client.connect();
      } catch {
        // Treat connection failures as a disabled Redis backend for this request.
        return null;
      }

      this.client = client;
      return client;
    } catch (error) {
      console.warn("Could not initialize Redis client:", error);
      return null;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      const client = await this.getClient();
      if (!client) {
        return null;
      }

      return await client.hget(key, field);
    } catch (error) {
      console.warn(`Redis hget failed for ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string): Promise<"OK" | null> {
    try {
      const client = await this.getClient();
      if (!client) {
        return null;
      }

      return await client.set(key, value);
    } catch (error) {
      console.warn(`Redis set failed for ${key}:`, error);
      return null;
    }
  }

  async del(key: string): Promise<number | null> {
    try {
      const client = await this.getClient();
      if (!client) {
        return null;
      }

      return await client.del(key);
    } catch (error) {
      console.warn(`Redis del failed for ${key}:`, error);
      return null;
    }
  }

  async exists(key: string): Promise<number | null> {
    try {
      const client = await this.getClient();
      if (!client) {
        return null;
      }

      return await client.exists(key);
    } catch (error) {
      console.warn(`Redis exists failed for ${key}:`, error);
      return null;
    }
  }

  async ping(): Promise<string | null> {
    try {
      const client = await this.getClient();
      if (!client) {
        return null;
      }

      return await client.ping();
    } catch (error) {
      console.warn("Redis ping failed:", error);
      return null;
    }
  }
}

export const redis = new RedisClientWrapper();
export const isRedisConfigured = Boolean(configuredRedisUrl);
