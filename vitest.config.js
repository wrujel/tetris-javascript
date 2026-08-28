import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['main.js', 'utils/*.js'],
      reporter: ['text', 'json-summary', 'lcov']
    }
  }
})
