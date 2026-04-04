import pg from "pg";

const connectionString = Deno.env.get("DATABASE_URL");
if (!connectionString) throw new Error("DATABASE_URL env var is required");

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

export function getPool() {
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  return await pool.query(text, params);
}
