import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3100';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'desktop-chromium',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1440, height: 900 },
            },
        },
        {
            name: 'mobile-se',
            use: {
                ...devices['iPhone SE'],
                browserName: 'chromium',
                viewport: { width: 375, height: 667 },
            },
        },
        {
            name: 'mobile-iphone',
            use: {
                ...devices['iPhone 14'],
                browserName: 'chromium',
                viewport: { width: 390, height: 844 },
            },
        },
        {
            name: 'mobile-landscape',
            use: {
                ...devices['iPhone 14 landscape'],
                browserName: 'chromium',
                viewport: { width: 844, height: 390 },
            },
        },
        {
            name: 'tablet-portrait',
            use: {
                ...devices['iPad (gen 11)'],
                browserName: 'chromium',
                viewport: { width: 768, height: 1024 },
            },
        },
        {
            name: 'tablet-landscape',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1024, height: 768 },
            },
        },
    ],
    webServer: process.env.PLAYWRIGHT_BASE_URL
        ? undefined
        : {
            command: 'npm run dev -- --port 3100',
            env: { PLAYWRIGHT_TEST: '1' },
            url: baseURL,
            reuseExistingServer: false,
        },
});
