export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  mset<T>(entries: { key: string; value: T; ttlMs: number }[]): Promise<void>;
  incr(key: string, by: number, ttlMs: number): Promise<number>;
}
