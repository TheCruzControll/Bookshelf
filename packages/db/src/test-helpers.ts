import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./client";

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

export async function createMigratedDb(connectionString: string) {
  const db = createDb(connectionString);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../drizzle"),
  });
  return db;
}
