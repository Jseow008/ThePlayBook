import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('.', import.meta.url)),
            'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        globals: true,
        exclude: ['**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*', 'tests/e2e/**'],
    },
});
