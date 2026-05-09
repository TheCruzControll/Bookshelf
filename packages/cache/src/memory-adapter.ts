import type { Cache } from "./port.js";

interface Entry<T> {
  value: T;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export class MemoryCache implements Cache {
  private readonly store = new Map<string, Entry<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.evict(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.evict(key);
    const expiresAt = Date.now() + ttlMs;
    const timer = setTimeout(() => this.evict(key), ttlMs);
    if (typeof timer === "object" && "unref" in timer) {
      (timer as NodeJS.Timeout).unref();
    }
    this.store.set(key, { value, expiresAt, timer });
  }

  async del(key: string): Promise<void> {
    this.evict(key);
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map((k) => this.get<T>(k)));
  }

  async mset<T>(entries: { key: string; value: T; ttlMs: number }[]): Promise<void> {
    await Promise.all(entries.map((e) => this.set(e.key, e.value, e.ttlMs)));
  }

  async incr(key: string, by: number, ttlMs: number): Promise<number> {
    const current = await this.get<number>(key);
    const next = (current ?? 0) + by;
    if (current === null) {
      await this.set(key, next, ttlMs);
    } else {
      const entry = this.store.get(key);
      if (entry) {
        entry.value = next;
      }
    }
    return next;
  }

  private evict(key: string): void {
    const entry = this.store.get(key);
    if (entry) {
      clearTimeout(entry.timer);
      this.store.delete(key);
    }
  }
}
