import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

// The single .env lives at the repo root and is shared by api/ and sync/.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set (copy .env.example to .env)')
}

// Neon requires TLS; the local Docker Postgres does not.
const useSsl = /neon\.tech/.test(connectionString)

export const pool = new pg.Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: true } : undefined,
})
