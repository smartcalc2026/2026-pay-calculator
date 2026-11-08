const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4179',
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: {
    command: 'node test-server.js',
    url: 'http://127.0.0.1:4179/health',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
