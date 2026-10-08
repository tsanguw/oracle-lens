import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url))

/** Apply every unapplied .sql file in api/migrations, in filename order, one transaction each. */
export async function runMigrations(pool: pg.Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)

  const applied = new Set(
    (await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
      (r) => r.filename,
    ),
  )
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()
  const ran: string[] = []

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(migrationsDir + file, 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      ran.push(file)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
  return ran
}
