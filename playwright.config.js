import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  timeout: 30000,
  retries: 0,
  use: {
    headless: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'node tests/test-server.js',
    port: 3947,
    reuseExistingServer: !process.env.CI,
  },
});
