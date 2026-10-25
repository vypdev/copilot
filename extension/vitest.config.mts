import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'], maxWorkers: 2, testTimeout: 30_000, hookTimeout: 30_000,
        coverage: {
            provider: 'v8', allowExternal: true, reportsDirectory: 'coverage', reporter: ['text', 'json-summary'],
            include: ['src/**/*.ts', 'tooling/*.mts', '../src/domain/browser_extension_contract/**/*.ts'],
            thresholds: {
                perFile: true, statements: 95, branches: 90, functions: 95, lines: 95,
                'src/domain/**': { branches: 100 },
                '../src/domain/browser_extension_contract/**': { branches: 100 },
            },
        },
    },
});
