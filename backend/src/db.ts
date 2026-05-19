import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://genyx:genyxsecret@localhost:5432/genyx";

export const pg = new Pool({ connectionString });

pg.on("error", (err: Error) => {
  console.error("💥 Postgres pool error:", err.message);
});
