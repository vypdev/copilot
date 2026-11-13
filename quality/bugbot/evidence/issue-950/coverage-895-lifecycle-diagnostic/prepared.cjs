'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { validateProof } = require('../coverage-895-pilot/runner.cjs');
const { receipt } = require('../on-demand/contract.cjs');
const { read, sourceLimits } = require('../git-path-pattern/adapter.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const audit = require('../coverage-895-complete-diagnostic/lifecycle-audit.json');
const ranges = require('./ranges.json');

function prepare(subject, session, archives) {
    // The historical fixture independently checks the pinned lock snapshots,
    // archive integrity, installed bytes and import paths before calling this.
    const prior = session.initial.filter(p => p.kind === 'dependency');
    const files = new Map();
    const archivesChecked = new Set();
    function lines(proof) {
        const key = proof.package + ':' + proof.file;
        if (!files.has(key)) {
            const archive = join(archives, proof.package.replace(/^@/u, '').replace('/', '-') + '-' + proof.version + '.tgz');
            if (!archivesChecked.has(archive)) {
                assert(statSync(archive).size <= 1024 * 1024);
                const integrity = 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64');
                assert.equal(integrity, proof.integrity, 'archive-integrity');
                archivesChecked.add(archive);
            }
            const bytes = execFileSync('tar', ['-xOf', archive, 'package/' + proof.file], { timeout: 2000, maxBuffer: 1024 * 1024 });
            assert.equal(digest(bytes), proof.fileSha256, 'archive-file-integrity');
            files.set(key, bytes.toString('utf8').split(/\r?\n/u));
        }
        return files.get(key);
    }
    const textAt = (proof, start, end) => {
        const source = lines(proof);
        assert(start > 0 && start <= end && end <= source.length && end - start + 1 <= sourceLimits.lines);
        const text = source.slice(start - 1, end).join('\n');
        assert(byteLength(text) <= sourceLimits.fragmentBytes);
        return text;
    };
    function slice(proof, link, start, end) {
        const { kind, package: name, version, integrity, specifier, entry, file, fileSha256, lockPath, lockBlob } = proof;
        return receipt(session.identity, { kind, link, package: name, version, integrity, specifier, entry, file, fileSha256,
            lockPath, lockBlob, start, end, text: textAt(proof, start, end) });
    }
    const authenticated = new Map();
    for (const entry of audit) {
        const base = prior.find(p => p.package === entry.package && p.file === entry.file);
        assert(base);
        assert.deepEqual([base.version, base.fileSha256, base.lockBlob], [entry.version, entry.fileSha256, entry.lockBlob]);
        for (const [role, { lines: [start, end], excerptSha256 }] of Object.entries(entry.ranges)) {
            assert.equal(digest(textAt(base, start, end)), excerptSha256, role);
            authenticated.set(role, { base, start, end });
        }
    }
    const parentLink = { 'effective-exclusion-matchers': 'exclude-tested-and-untested',
        'untested-files-use-exclusions': 'exclude-tested-and-untested',
        'untested-second-pass': 'exclude-tested-and-untested', 'v8-merge-untested': 'v8-merge-tested-and-untested',
        'execute-coverage-reporters': 'report-from-coverage-map', 'reporter-writes-context': 'report-from-coverage-map',
        'summary-file-keys': 'summary-writer' };
    const retained = ranges.retained.map(([link, start, end]) => {
        const base = prior.find(p => p.link === (parentLink[link] ?? link));
        assert(base && start >= base.start && end <= base.end, link);
        return slice(base, link, start, end);
    });
    const roles = { 'project-attachment': 'project-attachment-dispatches-configureVitest',
        'coverage-start-entry': 'coverage-initialization-in-start' };
    const lifecycle = ranges.lifecycle.map(([link, start, end]) => {
        const role = roles[link] ?? link;
        const located = authenticated.get(role);
        // The prepare bridge was located in the same authenticated CLI member.
        if (link.startsWith('prepare-')) return slice(authenticated.get('cli-awaits-prepare').base, link, start, end);
        assert(located && start >= located.start && end <= located.end, link);
        return slice(located.base, link, start, end);
    });
    const extraLifecycle = ranges.sameAuthenticatedFiles.map(([link, reference, start, end]) => {
        const base = prior.find(p => p.link === reference);
        assert(base, reference);
        return slice(base, link, start, end);
    });
    const gitSlice = (scope, start, end) => {
        const response = read(session.cwd, session.identity, { revision: 'head', kind: 'readBlob',
            targets: [{ scope, workspace: null, match: 'lines', query: null, start, end }] });
        assert.equal(response.result?.status, 'provided');
        assert.equal(response.result.receipts.length, 1);
        return response.result.receipts[0];
    };
    const extra = [gitSlice('vitest.config.ts', 2, 6), gitSlice('vitest.config.ts', 8, subject === 'original' ? 15 : 24),
        gitSlice('tooling/coverage.mjs', 1, 2), gitSlice('package.json', 11, 11)];
    const proofs = [...retained, ...lifecycle, ...extraLifecycle, ...session.initial.filter(p => p.kind === 'git'), ...extra];
    const compactSession = { ...session, initial: proofs };
    for (const proof of proofs) validateProof(compactSession, proof);
    return { session: compactSession, proofs };
}

module.exports = { prepare };
