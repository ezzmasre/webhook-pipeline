// src/db/client.ts
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Single shared connection pool for the whole app
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test the connection on startup
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err);
  process.exit(1);
});

export async function checkDbConnection(): Promise<void> {
  const client = await pool.connect();
  client.release();
}
