import pg from "pg";

const pool = new pg.Pool({
  host: "/var/run/postgresql",
  port: 5433,
  user: "convem",
  database: "alapar",
});

export function getPool() {
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  return await pool.query(text, params);
}
