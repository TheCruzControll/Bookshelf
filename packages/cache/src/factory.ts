import { Redis } from "ioredis";
import type { Cache } from "./port.js";
import { MemoryCache } from "./memory-adapter.js";
import { RedisCache } from "./redis-adapter.js";

export interface CacheConfig {
  CACHE_DRIVER: "memory" | "redis";
  REDIS_URL?: string | undefined;
}

export function buildCache(config: CacheConfig): Cache {
  if (config.CACHE_DRIVER === "redis") {
    if (!config.REDIS_URL) {
      throw new Error("REDIS_URL is required when CACHE_DRIVER=redis");
    }
    return new RedisCache(new Redis(config.REDIS_URL));
  }
  return new MemoryCache();
}
