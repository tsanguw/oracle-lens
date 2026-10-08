import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })

const base = process.env.DATABASE_URL ?? 'postgresql://lolstats:lolstats@localhost:5432/lolstats'

/** Tests never touch the dev database: same server, separate `lolstats_test` database. */
export const TEST_DATABASE_URL = base.replace(/\/[^/?]+(\?|$)/, '/lolstats_test$1')
