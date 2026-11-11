'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { hash } = require('./session.cjs');
const plan = require('./plan.json');
const official = require('./official.json');

const blocked = code => ({ status: code });
const safePath = value => typeof value === 'string' && value.length <= 300 && !/[\\\u0000-\u001f\u007f]/u.test(value)
    && value.split('/').every(part => part && !['.', '..', '.git'].includes(part.toLowerCase()));
const linesOf = source => source.replace(/\n$/u, '').split(/\r?\n/u);

function git(repo, args, exits = [0]) {
    const result = spawnSync('git', ['--no-pager', '--literal-pathspecs', '-C', repo, ...args], {
        encoding: 'utf8', timeout: plan.toolMs, maxBuffer: 4 * 1024 * 1024,
        env: { PATH: process.env.PATH, LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    if (result.error) throw new Error('git-budget', { cause: result.error });
    if (!exits.includes(result.status)) throw new Error('git-unavailable');
    return result.stdout;
}

function blob(repo, sha, file) {
    if (!safePath(file)) throw new Error('path-denied');
    const row = git(repo, ['ls-tree', '-z', sha, '--', file]);
    const entry = /^(100644|100755) blob ([a-f0-9]{40})\t([^\u0000]+)\u0000$/u.exec(row);
    if (!entry || entry[3] !== file) throw new Error('no-file');
    const source = git(repo, ['cat-file', 'blob', entry[2]]);
    if (source.includes('\u0000') || source.includes('\uFFFD')) throw new Error('non-text');
    return { blob: entry[2], lines: linesOf(source) };
}

function clip(lines, first, last) {
    let bytes = 0, end = first - 1;
    for (; end < last; end++) {
        bytes += Buffer.byteLength(lines[end]) + 1;
        if (bytes > plan.fragmentBytes) break;
    }
    return { first, last: end, lines: lines.slice(first - 1, end) };
}

function intervals(patch) {
    return Array.from(patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gmu), match => {
        const start = Number(match[1]);
        return [start, start + Number(match[2] ?? 1) - 1];
    });
}

function makeBroker(lab, subject, finding) {
    const repo = path.join(lab, subject.repository.split('/')[1] + '.git');
    const binding = { finding: finding.id, repository: subject.repository, head: subject.head, anchor: finding.detectorLocation };
    const receipts = new Map();
    let bytes = 0, actions = 0;

    function grant(proofs) {
        const result = proofs.map(proof => ({ ...proof, receipt: 'R' + hash(JSON.stringify({ binding, proof })).slice(0, 24) }));
        const cost = Buffer.byteLength(JSON.stringify(result));
        if (cost + bytes > plan.evidenceBytes) return blocked('evidence-budget');
        bytes += cost;
        for (const proof of result) receipts.set(proof.receipt, proof);
        return { status: 'provided', sources: result };
    }

    function doc(request) {
        const packageName = request.target === '@playwright/test' ? 'playwright' : request.target.toLowerCase();
        const proof = receipts.get(request.basis);
        const supported = official.filter(item => item.package === packageName && item.version === request.version);
        if (!supported.length) return blocked('official-source-unavailable');
        const hasVersion = packageName === 'sqlite'
            ? proof?.kind === 'runtime' && proof.lines[0].includes(request.version)
            : proof?.kind === 'git' && proof.sha === subject.head && proof.path === 'pnpm-lock.yaml'
                && proof.lines.join('\n').includes(request.version) && proof.lines.join('\n').includes('playwright');
        if (!hasVersion) return blocked('official-version-not-proven');
        if (typeof request.query !== 'string' || !request.query.trim() || request.query.length > 120) return blocked('official-query');
        const sources = [];
        for (const item of supported) {
            const contents = readFileSync(path.join(lab, item.file));
            assert.equal(hash(contents), item.sha256, 'official-source-hash');
            const lines = linesOf(contents.toString('utf8'));
            const matches = lines.flatMap((line, index) => line.includes(request.query) ? [index + 1] : []);
            const windows = [];
            for (const match of matches) {
                const first = Math.max(1, match - 5);
                const last = Math.min(lines.length, match + 8);
                const previous = windows.at(-1);
                if (previous && first <= previous.last && last - previous.first <= 45) previous.last = last;
                else windows.push({ first, last });
            }
            for (const window of windows.slice(0, 4)) {
                sources.push({ kind: 'official', package: packageName, version: item.version, sourceKind: item.kind,
                    url: item.url, commit: item.commit, sha256: item.sha256, basis: request.basis,
                    ...clip(lines, window.first, window.last) });
            }
        }
        return sources.length ? grant(sources) : blocked('official-no-match');
    }

    function run(request) {
        if (++actions > plan.maxActions) return blocked('action-budget');
        if (request.revision === 'base' && !finding.allowBase) return blocked('base-denied');
        if (!request.target.trim() || request.target.length > 300 || /[\u0000-\u001f\u007f]/u.test(request.target)
            || !request.why.trim() || Buffer.byteLength(request.why) > 500) return blocked('invalid-query');
        const sha = request.revision === 'head' ? subject.head : subject.base;
        if (request.op === 'official') return doc(request);
        if (request.op === 'runtime') {
            const proof = receipts.get(request.basis);
            if (request.target !== 'sqlite' || proof?.kind !== 'git' || proof.sha !== subject.head
                || proof.path !== '.python-version' || !proof.lines.includes(plan.localRuntime.python)) return blocked('runtime-basis');
            return grant([{ kind: 'runtime', first: 1, last: 1, sha: subject.head, basis: request.basis,
                lines: [`Python ${plan.localRuntime.python}; SQLite ${plan.localRuntime.sqlite}; ${plan.localRuntime.scope}`] }]);
        }
        if (request.scope !== null && !safePath(request.scope)) return blocked('scope-denied');
        if (request.op === 'read') {
            const value = blob(repo, sha, request.target);
            const first = request.first ?? 1, last = request.last ?? value.lines.length;
            if ((request.first === null) !== (request.last === null) || first < 1 || first > last || last > value.lines.length) {
                return { status: 'invalid-range', lineCount: value.lines.length };
            }
            const excerpt = clip(value.lines, first, last);
            if (!excerpt.lines.length) return blocked('fragment-budget');
            return { ...grant([{ kind: 'git', sha, path: request.target, blob: value.blob, ...excerpt }]),
                lineCount: value.lines.length, truncated: excerpt.last < last };
        }
        const scope = request.scope ? [request.scope] : [];
        let matches;
        if (request.op === 'paths') {
            matches = git(repo, ['ls-tree', '-r', '--name-only', '-z', sha, '--', ...scope]).split('\u0000')
                .filter(file => safePath(file) && file.includes(request.target));
        } else {
            matches = git(repo, ['grep', '-n', '-I', '-F', '-e', request.target, sha, '--', ...scope], [0, 1])
                .split('\n').filter(Boolean).map(line => line.slice(41, 331));
        }
        const retained = matches.slice(0, 30);
        const cost = Buffer.byteLength(JSON.stringify(retained));
        if (bytes + cost > plan.evidenceBytes) return blocked('evidence-budget');
        bytes += cost;
        return { status: matches.length ? 'matches' : 'no-match', count: matches.length, truncated: matches.length > retained.length, matches: retained };
    }

    function inspect(request) {
        try { return run(request); } catch (error) {
            if (['no-file', 'path-denied', 'non-text', 'git-budget', 'git-unavailable'].includes(error.message)) return blocked(error.message);
            throw error;
        }
    }

    function cite(citation) {
        const proof = receipts.get(citation.receipt);
        if (!proof || citation.first < proof.first || citation.last > proof.last || citation.first > citation.last) {
            throw new Error('citation-unavailable-or-out-of-range');
        }
        const { lines, ...location } = proof;
        assert.equal('R' + hash(JSON.stringify({ binding, proof: locationWithText(location, lines) })).slice(0, 24), citation.receipt);
        const selected = lines.slice(citation.first - proof.first, citation.last - proof.first + 1);
        if (proof.kind === 'git') {
            const value = blob(repo, proof.sha, proof.path);
            assert.equal(value.blob, proof.blob);
            assert.deepEqual(selected, value.lines.slice(citation.first - 1, citation.last));
            const diff = proof.sha === subject.head
                ? intervals(git(repo, ['diff', '--no-ext-diff', '--no-textconv', '--unified=0', subject.base, subject.head, '--', proof.path]))
                : [];
            location.inChangedLines = diff.some(([start, end]) => citation.first <= end && citation.last >= start);
            location.unchangedFile = proof.sha === subject.head &&
                git(repo, ['ls-tree', '-z', subject.base, '--', proof.path]) === git(repo, ['ls-tree', '-z', subject.head, '--', proof.path]);
        }
        return { ...location, first: citation.first, last: citation.last, textSha256: hash(selected.join('\n')) };
    }

    return { inspect, cite, usage: () => ({ bytes, actions }), binding };
}

function locationWithText(location, lines) {
    const { receipt, ...proof } = location;
    return { ...proof, lines };
}

module.exports = { git, blob, makeBroker };
