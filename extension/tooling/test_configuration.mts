import { defineConfig } from 'vitest/config';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const require = createRequire(import.meta.url);
const svelteManifest = require.resolve('svelte/package.json');
const svelteClient = new URL(require(svelteManifest).exports['.'].browser, pathToFileURL(svelteManifest));

export default defineConfig({
    plugins: [svelte({ configFile: false, compilerOptions: { dev: false } })],
    // Scope the browser export to Svelte; Node build/driver tests retain their native exports.
    resolve: { alias: [{ find: /^svelte$/u, replacement: fileURLToPath(svelteClient) }] },
    test: {
        include: ['test/**/*.test.ts'], maxWorkers: 2, testTimeout: 30_000, hookTimeout: 30_000,
        coverage: {
            provider: 'v8', allowExternal: true, reportsDirectory: 'coverage',
            reporter: ['text', 'json-summary', ['lcovonly', { projectRoot: fileURLToPath(new URL('../..', import.meta.url)) }]],
            include: ['src/**/*.ts', 'src/**/*.svelte', 'tooling/*.mts', '../src/domain/browser_extension_contract/**/*.ts'],
            thresholds: {
                perFile: true, statements: 95, branches: 90, functions: 95, lines: 100,
                'src/domain/**': { branches: 100 },
                '../src/domain/browser_extension_contract/**': { branches: 100 },
            },
        },
    },
});
