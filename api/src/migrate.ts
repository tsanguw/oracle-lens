import { pool } from './db.js'
import { runMigrations } from './migrations.js'

runMigrations(pool)
  .then((ran) => {
    ran.forEach((f) => console.log(`applied ${f}`))
    console.log('migrations up to date')
  })
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
