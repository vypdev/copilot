'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { git, receipt } = require('../on-demand/contract.cjs');
const { selectAnchor } = require('../tree-search/contract.cjs');
const { sourceReader, lineRead } = require('../detector-verifier-diagnostic/runner.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const lock = require('../coverage-895-reserved/subjects.lock.json');
const published = require('../coverage-895-reserved/dependency-control.json');

function fixtures(lab, archives) {
    const control = require.resolve('../coverage-895-reserved/dependency-control.cjs');
    const result = execFileSync(process.execPath, [control, lab, archives], { encoding: 'utf8', timeout: 30_000 });
    assert.deepEqual(JSON.parse(result), published);
    return Object.fromEntries(Object.entries(lock).map(([subject, binding]) => {
        const cwd = path.join(lab, subject);
        const frozen = published.cases[subject];
        const candidate = { id: 'c-895', anchor: binding.anchor, hypothesis: 'The effective coverage configuration admits a Storybook CSF definition to the JSON summary, causing the runtime inventory check to fail.' };
        const identity = { ...binding, operation: digest(JSON.stringify([binding.head, binding.tree, candidate])), candidate: candidate.id, scopes: [''] };
        const patch = git(cwd, '-c', 'core.quotePath=true', 'diff', '--no-ext-diff', '--no-textconv',
            '--no-renames', '--unified=3', binding.base, binding.head, '--', binding.anchor.path);
        assert.equal(digest(patch), binding.anchorDiffSha256);
        const hunk = patch.slice(patch.indexOf('@@ '));
        assert.deepEqual(selectAnchor(binding.anchor, hunk).selected, binding.anchor);
        const [header, ...lines] = hunk.split('\n');
        const excerpt = [header, '[excerpt near the candidate anchor]', ...lines.slice(binding.anchor.line - 4, binding.anchor.line + 4)].join('\n');

        const cache = new Map();
        const dependency = frozen.dependencyReceipts.map(meta => {
            const { id, artifact, candidate: _candidate, operation, head, tree, bytes, ...source } = meta;
            const archive = path.join(archives, source.package.replace(/^@/u, '').replace('/', '-') + '-' + source.version + '.tgz');
            const key = archive + ':' + source.file;
            if (!cache.has(key)) {
                const content = execFileSync('tar', ['-xOf', archive, 'package/' + source.file],
                    { timeout: 2000, maxBuffer: 1024 * 1024 });
                assert.equal(digest(content), source.fileSha256);
                cache.set(key, content.toString('utf8').split(/\r?\n/u));
            }
            const text = cache.get(key).slice(source.start - 1, source.end).join('\n');
            assert.equal(byteLength(text), bytes);
            const proof = receipt(identity, { ...source, text });
            const { bytes: measured, ...attestation } = meta;
            assert.deepEqual(proof, { ...attestation, text }, 'published-dependency-receipt');
            return proof;
        });
        const reader = sourceReader({ cwd }, { head: identity });
        const initial = [...dependency, ...[
            ['.storybook/main.ts', 2, 5],
            ['tooling/coverage.mjs', 33, 41],
            ['tests/coverage-evidence.test.mjs', 6, 11],
        ].map(([file, start, end]) => {
            const evidence = reader.read(lineRead(file, start, end), false);
            assert.equal(evidence.status, 'provided');
            assert.equal(evidence.receipts.length, 1);
            return evidence.receipts[0];
        })];
        assert.deepEqual(initial.map(proof => proof.id), frozen.initialSources);
        const resolutions = Object.fromEntries(dependency.map(({ package: name, version, integrity }) =>
            [name, { version, integrity }]));
        return [subject, { cwd, candidate, identity, excerpt, resolutions, initial, preparedGitUsage: reader.usage() }];
    }));
}

module.exports = { fixtures };
