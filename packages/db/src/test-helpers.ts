import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type StartedPostgresContainer = {
  connectionString: string;
  stop: () => Promise<void>;
};

export async function startPostgresContainer(): Promise<StartedPostgresContainer> {
  const { GenericContainer } = await import("testcontainers");
  const container = await new GenericContainer("postgres:16-alpine")
    .withEnvironment({
      POSTGRES_USER: "hone",
      POSTGRES_PASSWORD: "hone",
      POSTGRES_DB: "hone_test",
    })
    .withExposedPorts(5432)
    .start();

  const port = container.getMappedPort(5432);
  const connectionString = `postgresql://hone:hone@127.0.0.1:${port}/hone_test`;

  return {
    connectionString,
    stop: async () => { await container.stop(); },
  };
}

export type MigratedDb = ReturnType<typeof drizzle<typeof schema>> & {
  endPool: () => Promise<void>;
};

export async function createMigratedDb(connectionString: string): Promise<MigratedDb> {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema }) as MigratedDb;
  db.endPool = () => pool.end();
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../drizzle"),
  });
  return db;
}
