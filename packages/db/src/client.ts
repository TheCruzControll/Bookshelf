import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type HoneDb = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });

  return drizzle(pool, { schema });
}

