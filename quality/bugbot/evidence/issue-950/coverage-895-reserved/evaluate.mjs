import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { globSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { platform, arch, release } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const locks = JSON.parse(readFileSync(new URL('./subjects.lock.json', import.meta.url)));
const lab = path.resolve(process.argv[2]);
const unexpected = 'stories/button.stories.ts';
const pattern = 'stories/**/*.stories.ts';
const sha = data => createHash('sha256').update(data).digest('hex');
const json = filename => JSON.parse(readFileSync(filename));
const manifest = { environment: { node: process.version, v8: process.versions.v8, platform: platform(), arch: arch(),
    kernel: release(), pnpm: execFileSync('corepack', ['pnpm@10.34.0', '--version'], { encoding: 'utf8' }).trim() }, cases: {} };
const coverage = {};

for (const [subject, lock] of Object.entries(locks)) {
    const root = realpathSync(path.join(lab, subject));
    process.chdir(root);
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    assert.equal(git('rev-parse', 'HEAD'), lock.head);
    assert.equal(git('rev-parse', 'HEAD^{tree}'), lock.tree);
    assert.equal(git('rev-parse', 'HEAD:pnpm-lock.yaml'), lock.lockBlob);
    assert.equal(git('status', '--porcelain'), '');
    assert.equal(json('package.json').scripts.test, 'vitest run --coverage && node --test tests/coverage-evidence.test.mjs');
    const exit = Number(readFileSync(path.join(lab, subject + '-status'), 'utf8'));
    assert.equal(exit, subject === 'original' ? 0 : 1);
    const log = readFileSync(path.join(lab, subject + '-test.log'), 'utf8');
    assert.match(log, /Test Files\s+54 passed \(54\)/u);
    assert.match(log, /Tests\s+1155 passed \(1155\)/u);
    assert.doesNotMatch(log, /ERROR: Coverage|Failed Suites|Unhandled Errors/u);
    assert.match(log, subject === 'original' ? /✔ coverage includes every authored/u : /✖ coverage includes every authored/u);
    assert.doesNotMatch(log, /vitest.*failed to load config/u);

    const require = createRequire(path.join(root, 'package.json'));
    // Storybook service state is process-global. Resolve each subject in a fresh process.
    const snapshot = `
        import { createVitest } from 'vitest/node';
        const context = await createVitest('test', { run: true, coverage: { enabled: true } });
        try {
            const { config: storybook } = context.projects.find(({ config }) => config.name.startsWith('storybook'));
            const { exclude, include, reporter, thresholds } = context.config.coverage;
            console.log(JSON.stringify({ storybookInclude: storybook.include, storybookExclude: storybook.coverage.exclude,
                include, exclude, reporter, thresholds }));
        } finally { await context.close(); }
    `;
    const resolved = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', snapshot], {
        cwd: root, env: { ...process.env, VITEST: 'true', TEST: 'true', NODE_ENV: 'test' }, encoding: 'utf8', timeout: 30_000,
    }));
    assert.deepEqual(resolved.storybookInclude, [pattern]);
    assert(resolved.exclude.includes(subject === 'original' ? pattern : 'stories/**/!(button).stories.ts'));
    assert.equal(resolved.exclude.includes(pattern), subject === 'original');

    const { coverageProblems, runtimeExtensions, metrics } = await import(pathToFileURL(path.join(root, 'tooling/coverage.mjs')));
    const inventory = ['packages/*/src', 'tooling', 'stories', '.storybook']
        .flatMap(directory => globSync(`${directory}/**/*.${runtimeExtensions}`))
        .filter(filename => !/\.d\.(ts|mts|cts)$|\.stories\.ts$/u.test(filename)).sort();
    assert.equal(inventory.length, 52);
    const file = readFileSync('coverage/coverage-summary.json');
    const report = JSON.parse(file);
    const problems = coverageProblems(report, inventory.map(filename => path.join(root, filename)));
    const normalized = Object.fromEntries(Object.entries(report).map(([name, value]) => [name === 'total' ? name : path.relative(root, name), value]));
    const extras = Object.keys(normalized).filter(key => key !== 'total' && !inventory.includes(key)).sort();
    assert.deepEqual(extras, subject === 'original' ? [] : [unexpected]);
    assert.equal(Object.keys(normalized).length, subject === 'original' ? 53 : 54);
    assert.deepEqual(problems, subject === 'original' ? [] : [
        'Unexpected coverage file: ' + path.join(root, unexpected), 'total: incomplete branches coverage',
    ]);
    for (const module of inventory) {
        assert(metrics.every(metric => normalized[module][metric].pct === 100));
    }
    coverage[subject] = normalized;
    manifest.cases[subject] = { ...lock, typecheck: 'passed', command: json('package.json').scripts.test,
        exit, testFiles: 54, testsPassed: 1155, resolved, coverageSha256: sha(file), entryCount: Object.keys(normalized).length,
        runtimeInventory: inventory, unexpected: extras, total: normalized.total, story: normalized[unexpected] ?? null,
        inventoryProblems: problems.map(problem => problem.replace(root + '/', '')) };

    const { chromium } = require('playwright');
    if (!manifest.environment.chromium) {
        const browser = await chromium.launch({ headless: true });
        try {
            manifest.environment.chromium = browser.version();
            manifest.environment.playwright = require('playwright/package.json').version;
        } finally {
            await browser.close();
        }
    }

    if (subject === 'mutant') {
        assert.deepEqual(inventory, manifest.cases.original.runtimeInventory);
        for (const module of inventory) assert.deepEqual(normalized[module], coverage.original[module], module);
        for (const metric of metrics) for (const key of ['total', 'covered', 'skipped']) {
            assert.equal(normalized.total[metric][key] - normalized[unexpected][metric][key],
                coverage.original.total[metric][key], metric + '/' + key);
        }
        // Evaluator control only. The original report on disk still contains the CSF file.
        const withoutStory = { ...report, total: coverage.original.total };
        delete withoutStory[path.join(root, unexpected)];
        assert.deepEqual(coverageProblems(withoutStory, inventory.map(filename => path.join(root, filename))), []);
        manifest.isolation = { identicalRuntimeEntries: inventory.length, onlyExtra: unexpected,
            aggregateDeltaEqualsExtra: true, inMemoryRemovalPassesInventory: true };
    }
}

console.log(JSON.stringify(manifest, null, 2));
