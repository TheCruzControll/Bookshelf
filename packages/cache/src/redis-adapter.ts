import type { Cache } from "./port.js";
import type { Redis as RedisClient } from "ioredis";

export class RedisCache implements Cache {
  constructor(private readonly client: RedisClient) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "PX", ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const raws = await this.client.mget(...keys);
    return raws.map((raw) => (raw === null ? null : (JSON.parse(raw) as T)));
  }

  async mset<T>(entries: { key: string; value: T; ttlMs: number }[]): Promise<void> {
    if (entries.length === 0) return;
    const pipeline = this.client.pipeline();
    for (const { key, value, ttlMs } of entries) {
      pipeline.set(key, JSON.stringify(value), "PX", ttlMs);
    }
    await pipeline.exec();
  }

  async incr(key: string, by: number, ttlMs: number): Promise<number> {
    const pipeline = this.client.pipeline();
    pipeline.incrby(key, by);
    pipeline.pexpire(key, ttlMs, "NX");
    const results = await pipeline.exec();
    const incrResult = results?.[0];
    if (!incrResult) throw new Error("Redis incr pipeline returned no result");
    const [err, value] = incrResult;
    if (err) throw err;
    return value as number;
  }
}
