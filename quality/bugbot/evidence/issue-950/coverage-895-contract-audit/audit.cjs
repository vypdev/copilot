'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { fixtures } = require('../coverage-895-pilot/fixture.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { digest } = require('../v4/verification.cjs');
const { sourceLimits } = require('../git-path-pattern/adapter.cjs');

const [labArg, runArg] = process.argv.slice(2);
assert(labArg && runArg);
const lab = path.resolve(labArg), output = path.resolve(runArg);
const raw = file => {
    const target = path.join(output, file);
    return fs.existsSync(target) ? fs.readFileSync(target) : gunzipSync(fs.readFileSync(target + '.gz'));
};
const read = file => raw(file).toString('utf8');
const json = file => JSON.parse(read(file));
const sha = file => digest(raw(file));
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
const normalized = (data, root) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key === 'total' ? key : path.relative(root, key), value]));
const sessions = fixtures(lab, path.join(lab, 'archives'));

const dependencySlices = [
    ['collection-patterns', 'pattern-normalization', 2631, 2636],
    ['collection-includes', 'storybook-test-include', 2685, 2689],
    ['resolve-project-configurations', 'shared-coverage', 9349, 9350],
    ['resolve-project-options', 'shared-coverage', 7358, 7358],
    ['resolved-shared-exclusions', 'shared-coverage', 8802, 8805],
    ['append-test-exclusions', 'append-project-include', 8993, 9004],
    ['await-project-hooks', 'exclude-tested-and-untested', 12946, 12970],
    ['init-provider', 'exclude-tested-and-untested', 13130, 13137],
    ['provider-consumes-options', 'exclude-tested-and-untested', 6957, 6983],
    ['input-and-untested-filter', 'exclude-tested-and-untested', 6991, 7046],
    ['tested-conversion-remap', 'v8-source-filter', 267, 315],
    ['merge-and-final-map-filter', 'v8-source-filter', 65, 91],
    ['uncovered-conversion-remap', 'v8-source-filter', 122, 167],
    ['map-to-reporters', 'report-from-coverage-map', 93, 113],
    ['json-summary-key', 'summary-writer', 3, 19],
];

const cases = {}, summaries = {};
for (const [subject, session] of Object.entries(sessions)) {
    const binding = json(subject + '-binding.json');
    assert.deepEqual([binding.head, binding.tree, binding.lockBlob],
        [session.identity.head, session.identity.tree, session.identity.lockBlob]);
    const command = JSON.parse(git(session.cwd, 'show', binding.head + ':package.json')).scripts.test;
    assert.equal(binding.command, command);
    const source = [];
    for (const [link, reference, start, end] of dependencySlices) {
        const proof = session.initial.find(p => p.link === reference);
        assert(proof);
        const archive = path.join(lab, 'archives', proof.package.replace(/^@/u, '').replace('/', '-') + '-' + proof.version + '.tgz');
        const raw = execFileSync('tar', ['-xOf', archive, 'package/' + proof.file], { timeout: 2000, maxBuffer: 1024 * 1024 });
        assert.equal(digest(raw), proof.fileSha256);
        const lines = raw.toString('utf8').split(/\r?\n/u);
        const text = lines.slice(start - 1, end).join('\n');
        assert(end - start + 1 <= sourceLimits.lines && Buffer.byteLength(text) <= sourceLimits.fragmentBytes, link);
        const { id, artifact, text: _, ...meta } = proof;
        source.push(receipt(session.identity, { ...meta, link, start, end, text }));
    }
    for (const [file, start, end] of [
        ['stories/button.stories.ts', 1, 13], ['.storybook/main.ts', 2, 5], ['vitest.config.ts', 8, subject === 'original' ? 15 : 24],
        ['tooling/coverage.mjs', 1, 19], ['tooling/coverage.mjs', 33, 41], ['tests/coverage-evidence.test.mjs', 1, 12],
        ['package.json', 10, 12],
    ]) {
        const locator = binding.head + ':' + file;
        const blob = git(session.cwd, 'rev-parse', locator).trim();
        const text = git(session.cwd, 'show', locator).split(/\r?\n/u).slice(start - 1, end).join('\n');
        assert(end - start + 1 <= sourceLimits.lines && Buffer.byteLength(text) <= sourceLimits.fragmentBytes, file);
        source.push(receipt(session.identity, { kind: 'git', path: file, blob, start, end, text }));
    }
    const traces = read(subject + '-trace.jsonl').trim().split('\n').map(JSON.parse);
    const events = new Map();
    for (const [index, row] of traces.entries()) {
        if (row.event === 'member-loaded') {
            assert(binding.members.some(m => m.role === row.role && m.sha256 === row.sha256));
            assert.notEqual(row.sha256, row.observedSha256);
        } else {
            assert(!events.has(row.event), 'duplicate observation ' + row.event);
            events.set(row.event, { ...row, index });
        }
    }
    assert.equal(traces.filter(e => e.event === 'member-loaded').length, 3);
    const event = name => {
        assert(events.has(name), 'missing observation ' + name);
        return events.get(name);
    };
    assert(event('before-hooks').index < event('after-hooks').index);
    assert(event('after-hooks').index < event('provider-options').index);
    assert(event('provider-options').index < event('collection').index);
    assert(event('collection').index < event('tested-filter').index);
    assert(event('tested-filter').index < event('untested-candidates').index);
    assert(event('untested-candidates').index < event('final-map').index);
    assert.deepEqual(event('before-hooks').exclude, ['stories/**/*.stories.ts']);
    const exclude = subject === 'original' ? ['stories/**/*.stories.ts'] : ['stories/**/!(button).stories.ts'];
    assert.deepEqual(event('after-hooks').exclude, exclude);
    assert.deepEqual(event('provider-options').exclude, exclude);
    assert.equal(event('provider-options').provider, 'v8');
    assert.equal(event('provider-options').excludeAfterRemap, false);
    assert.deepEqual(event('collection').projects, ['storybook (chromium)']);
    const included = subject === 'mutant';
    assert.equal(event('tested-filter').included, included);
    assert.equal(event('tested-filter').environment, 'client');
    assert.equal(event('untested-candidates').listedAsUntested, false);
    assert.equal(event('untested-merge').inputHasStory, false);
    assert.equal(event('final-map').hasStory, included);
    if (included) {
        assert.equal(event('tested-remap').inputIsStory, true);
        assert.equal(event('tested-remap').outputHasStory, true);
        assert(event('tested-remap').index < event('tested-merge').index);
        assert.equal(event('tested-merge').outputHasStory, true);
        assert.equal(event('untested-candidates').alreadyTested, true);
        assert(event('final-map').index < event('summary-key').index);
    } else {
        assert(!events.has('tested-remap') && !events.has('tested-merge') && !events.has('summary-key'));
        assert.equal(event('untested-candidates').alreadyTested, false);
    }

    const reports = {};
    const artifacts = {};
    for (const mode of ['baseline', 'observed']) {
        const prefix = subject + '-' + mode;
        const raw = json(prefix + '-summary.json');
        const summary = normalized(raw, session.cwd);
        const key = path.join(session.cwd, binding.story);
        assert.equal(Object.hasOwn(raw, key), included);
        assert.equal(Object.keys(summary).length, included ? 54 : 53);
        const log = read(prefix + '.log').replace(/\u001b\[[\d;]*m/gu, '');
        assert(/Test Files\s+54 passed/u.test(log) && /Tests\s+1155 passed/u.test(log));
        assert.equal(Number(read(prefix + '.status').trim()), included ? 1 : 0);
        if (included) {
            assert(log.includes('Unexpected coverage file: ' + key));
            assert(log.includes('total: incomplete branches coverage'));
            assert(log.includes('tests/coverage-evidence.test.mjs:11'));
        } else assert(log.includes('ℹ pass 1') && log.includes('ℹ fail 0'));
        reports[mode] = summary;
        artifacts[mode] = { command, exit: included ? 1 : 0, reportKey: key, present: included,
            summarySha256: sha(prefix + '-summary.json'), normalizedSummarySha256: digest(canonical(summary)),
            logSha256: sha(prefix + '.log'), statusSha256: sha(prefix + '.status') };
    }
    assert.deepEqual(reports.baseline, reports.observed, 'instrumentation changed generated coverage');
    summaries[subject] = reports.baseline;
    const storyMetrics = reports.baseline[binding.story] ?? null;
    cases[subject] = { head: binding.head, tree: binding.tree, lockBlob: binding.lockBlob,
        command, cwd: session.cwd, resolutions: binding.resolutions, gitSources: binding.gitSources,
        artifacts, traceSha256: sha(subject + '-trace.jsonl'), bindingSha256: sha(subject + '-binding.json'),
        storyMetrics, source };
}
const original = summaries.original, mutant = summaries.mutant;
const extra = Object.keys(mutant).filter(key => !Object.hasOwn(original, key));
assert.deepEqual(extra, ['stories/button.stories.ts']);
const runtime = Object.keys(original).filter(key => key !== 'total');
assert.equal(runtime.length, 52);
for (const key of runtime) assert.deepEqual(mutant[key], original[key], key);
assert.deepEqual(Object.fromEntries(Object.entries(mutant['stories/button.stories.ts']).map(([metric, value]) => [metric, [value.covered, value.total]])),
    { lines: [2, 2], statements: [13, 13], functions: [7, 7], branches: [2, 4] });
const artifactHashes = Object.fromEntries(['environment.json', 'pnpm.version', 'playwright.version', 'chromium.version']
    .map(file => [file, sha(file)]));
console.log(JSON.stringify({ modelCalls: 0, evaluatorOnly: true,
    environment: { ...json('environment.json'), pnpm: read('pnpm.version').trim(),
        playwright: read('playwright.version').trim(), chromium: read('chromium.version').trim() },
    artifactHashes, cases, invariant: { identicalRuntimeEntries: runtime.length, extraMutantKeys: extra,
        observedAndBaselineReportsEqual: true, testedRouteObserved: true, untestedOnlyRouteExercised: false } }, null, 2));
