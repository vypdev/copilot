import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ROOT_PACKAGE_FILES, validatePackageContract } from '../../tooling/package_contract.mts';
import vitestConfig from '../../vitest.config.mts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require('js-yaml') as { load(value: string): unknown };
const read = (name: string) => readFileSync(`${root}/${name}`, 'utf8');
const pkg = () => JSON.parse(read('package.json'));
const extension = () => JSON.parse(read('extension/package.json'));
const workspace = () => yaml.load(read('pnpm-workspace.yaml')) as Parameters<typeof validatePackageContract>[2];
const ci = () => yaml.load(read('.github/workflows/ci_check.yml')) as Parameters<typeof validatePackageContract>[3];

it('bexh1-foundation-C25 preserves root npm file selection and excludes extension code/artifacts from the actual package inventory', () => {
    expect(pkg().files).toEqual(ROOT_PACKAGE_FILES);
    const pack = require('../../../scripts/npm-pack-command.cjs') as { runNpmPack(args: string[], options: object): string };
    const metadata = JSON.parse(pack.runNpmPack(['--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }));
    const files = metadata[0].files.map((file: { path: string }) => file.path) as string[];
    expect(files.length).toBeGreaterThan(20);
    expect(files.some(file => file.startsWith('extension/'))).toBe(false);
    expect(files.some(file => file.startsWith('src/domain/browser_extension_contract/'))).toBe(false);
    expect(files).toContain('build/github_action/index.js');
    expect(files).toContain('issue-admission/action.yml');
    expect(files).toContain('issue-admission/index.cjs');
});
it('bexh1-foundation-C28 parses root commands and CI gates; contributor guidance matches target claims and navigation', () => {
    expect(() => validatePackageContract(pkg(), extension(), workspace(), ci())).not.toThrow();
    const docs = read('docs/development/browser-extension.mdx');
    for (const command of ['build:extension', 'typecheck:extension', 'test:extension', 'validate:extension']) expect(docs).toContain(command);
    expect(docs).toContain('development-build-only');
    expect(docs).toContain('18.2');
    expect(read('docs.json')).toContain('/development/browser-extension');
    const workflow = yaml.load(read('.github/workflows/ci_check.yml')) as {
        jobs: { 'ci-check': { steps: { name?: string; with?: { files?: string } }[] } };
    };
    const upload = workflow.jobs['ci-check'].steps.find(step => step.name === 'Upload coverage to Codecov');
    expect(upload?.with?.files?.split(',')).toEqual(['./coverage/lcov.info', './extension/coverage/lcov.info']);
    expect(vitestConfig.test?.coverage).toMatchObject({ allowExternal: true,
        reporter: expect.arrayContaining([['lcovonly', { projectRoot: root }]]),
        include: expect.arrayContaining(['src/**/*.svelte', 'tooling/*.mts']) });
});

it('Safari H3 command registration cannot accidentally invoke the H2 rollback builder', () => {
    const wrongRoot = pkg(); wrongRoot.scripts['build:safari:center:extension'] = 'pnpm --dir extension run build:safari';
    expect(() => validatePackageContract(wrongRoot, extension(), workspace(), ci())).toThrow('dedicated Safari H3');
    const wrongEntry = extension(); wrongEntry.scripts['build:safari:center'] = 'node tooling/safari_cli.mts';
    expect(() => validatePackageContract(pkg(), wrongEntry, workspace(), ci())).toThrow('dedicated Safari H3');
});
it('rejects package publication drift and verifies meaningful missing orchestration/CI failures', () => {
    for (const mutate of [
        (value: ReturnType<typeof pkg>) => { value.files = ['**']; },
        (value: ReturnType<typeof pkg>) => { delete value.scripts['build:extension']; },
        (value: ReturnType<typeof pkg>) => { value.scripts.build = 'true'; },
        (value: ReturnType<typeof pkg>) => { value.scripts.test = 'true'; },
        (value: ReturnType<typeof pkg>) => { value.scripts.typecheck = 'true'; },
        (value: ReturnType<typeof pkg>) => { delete value.scripts['test:coverage']; },
        (value: ReturnType<typeof pkg>) => { value.scripts['test:coverage'] = 'jest --coverage && node scripts/validate-coverage-budgets.cjs'; },
    ]) { const value = pkg(); mutate(value); expect(() => validatePackageContract(value, extension(), workspace(), ci())).toThrow(); }
    expect(() => validatePackageContract(pkg(), { ...extension(), private: false }, workspace(), ci())).toThrow('identity');
    expect(() => validatePackageContract(pkg(), { ...extension(), version: '99' }, workspace(), ci())).toThrow('identity');
    expect(() => validatePackageContract(pkg(), extension(), {}, ci())).toThrow('overrides');
    expect(() => validatePackageContract(pkg(), extension(), { packages: ['extension'], overrides: { undici: 'changed' } }, ci())).toThrow('overrides');
    expect(() => validatePackageContract(pkg(), extension(), workspace(), {})).toThrow('CI gate');
    expect(() => validatePackageContract(pkg(), extension(), workspace(), { jobs: { missingSteps: {} } })).toThrow('CI gate');
    expect(() => validatePackageContract({}, extension(), workspace(), ci())).toThrow('file selection');
});
it('keeps reviewed rendering pins and both TypeScript/Svelte warning gates mandatory for extension acceptance', () => {
    for (const key of ['svelte', '@sveltejs/vite-plugin-svelte', 'svelte-check']) {
        const value = extension(); value.devDependencies[key] = 'latest';
        expect(() => validatePackageContract(pkg(), value, workspace(), ci())).toThrow('reviewed Svelte pins');
    }
    for (const script of ['tsc --noEmit', 'svelte-check --tsconfig tsconfig.svelte.json', 'true']) {
        const value = extension(); value.scripts.typecheck = script;
        expect(() => validatePackageContract(pkg(), value, workspace(), ci())).toThrow('warning/type gates');
    }
    const value = extension(); delete value.devDependencies;
    expect(() => validatePackageContract(pkg(), value, workspace(), ci())).toThrow('reviewed Svelte pins');
    const noScript = extension(); delete noScript.scripts;
    expect(() => validatePackageContract(pkg(), noScript, workspace(), ci())).toThrow('warning/type gates');
});
