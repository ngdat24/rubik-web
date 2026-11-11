import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 90000,
  use: {baseURL: 'http://127.0.0.1:4173', viewport: {width: 1280, height: 900},
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    launchOptions: {args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}},
  webServer: {command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI},
});
