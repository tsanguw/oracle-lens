import { defineConfig } from 'vitest/config'
import { TEST_DATABASE_URL } from './tests/testUrl.ts'

export default defineConfig({
  test: {
    // the suite sends far more than a person would, all from one address, so the rate limit is off except in its own test
    env: { DATABASE_URL: TEST_DATABASE_URL, RATE_LIMIT_PER_MINUTE: '0' },
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false,
  },
})
