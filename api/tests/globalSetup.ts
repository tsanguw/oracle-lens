import pg from 'pg'
import { runMigrations } from '../src/migrations.js'
import { TEST_DATABASE_URL } from './testUrl.ts'

/** Recreate the isolated test database and apply all migrations. */
export default async function setup() {
  const testUrl = new URL(TEST_DATABASE_URL)
  const dbName = testUrl.pathname.slice(1)
  if (dbName !== 'lolstats_test') throw new Error(`Refusing to reset non-test database "${dbName}"`)

  const adminUrl = new URL(testUrl)
  adminUrl.pathname = '/postgres'
  const admin = new pg.Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
  await admin.query(`CREATE DATABASE ${dbName}`)
  await admin.end()

  const pool = new pg.Pool({ connectionString: testUrl.toString() })
  await runMigrations(pool)
  await pool.end()
}
