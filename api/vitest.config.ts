import { defineConfig } from 'vitest/config'
import { TEST_DATABASE_URL } from './tests/testUrl.ts'

export default defineConfig({
  test: {
    env: { DATABASE_URL: TEST_DATABASE_URL },
    globalSetup: ['./tests/globalSetup.ts'],
    fileParallelism: false,
  },
})
