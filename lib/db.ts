import pg from "pg";

const connectionString = Deno.env.get("DATABASE_URL");
if (!connectionString) throw new Error("DATABASE_URL env var is required");

const isDev = !Deno.env.get("DENO_DEPLOYMENT_ID");

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 3,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
});

export function getPool() {
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  if (isDev) {
    console.log(`[DB] >> ${text.replace(/\n/g, " ").substring(0, 120)}`);
  }
  try {
    const result = await pool.query(text, params);
    if (isDev) {
      console.log(
        `[DB] << OK (${Date.now() - start}ms, ${result.rows.length} rows)`,
      );
    }
    return result;
  } catch (err) {
    if (isDev) {
      console.log(`[DB] << ERROR (${Date.now() - start}ms):`, err);
    }
    throw err;
  }
}
