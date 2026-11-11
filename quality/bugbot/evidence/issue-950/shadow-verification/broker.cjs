'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { hash } = require('../shadow-real-prs/session.cjs');
const { git, blob } = require('../shadow-real-prs/broker.cjs');
const plan = require('./plan.json');
const official = require('../shadow-real-prs/official.json');

const blocked = code => ({ status: code });
const officialPackage = target => target === '@playwright/test' ? 'playwright' : target.toLowerCase();
const safePath = value => typeof value === 'string' && value.length <= 300 && !/[\\\u0000-\u001f\u007f]/u.test(value)
    && value.split('/').every(part => part && !['.', '..', '.git'].includes(part.toLowerCase()));
const sqliteRuntimeBasis = { kind: 'git', path: '.python-version', revision: 'head' };
const linesOf = source => source.replace(/\n$/u, '').split(/\r?\n/u);

// Pages bound individual wire records. Every next page remains available.
const page = (items, first, pageSize) => ({
    items: items.slice(first - 1, first - 1 + pageSize),
    next: first - 1 + pageSize < items.length ? first + pageSize : null,
});
const window = (lines, first, last) => ({ first, last, lines: lines.slice(first - 1, last) });
const locationOf = ({ lines, ...location }) => location;

function intervals(patch) {
    return Array.from(patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gmu), match => {
        const start = Number(match[1]);
        return [start, start + Number(match[2] ?? 1) - 1];
    });
}

function makeBroker(lab, subject, finding, catalog = official) {
    const repo = path.join(lab, subject.repository.split('/')[1] + '.git');
    const binding = { finding: finding.id, repository: subject.repository, head: subject.head, tree: subject.tree, operation: randomUUID(), anchor: finding.detectorLocation };
    const receipts = new Map();

    function grant(proofs) {
        const result = proofs.map(proof => ({ ...proof, receipt: 'R' + hash(JSON.stringify({ binding, proof })).slice(0, 24) }));
        for (const proof of result) receipts.set(proof.receipt, proof);
        return { status: 'provided', sources: result };
    }

    function readBasis(receipt, sha, delivered) {
        const proof = receipts.get(receipt);
        const ranges = delivered.get(receipt);
        if (!proof || proof.sha !== sha || !ranges?.length) return null;
        const lines = proof.lines.filter((_line, index) =>
            ranges.some(range => range.first <= proof.first + index && proof.first + index <= range.last));
        return lines.length ? { ...proof, lines } : null;
    }

    function versionEvidence(request, packageName, proof) {
        if (proof?.kind === 'runtime' && proof.package === packageName
            && (request.version === null || request.version === proof.version)) {
            return { package: packageName, version: proof.version, versionScope: proof.versionScope };
        }
        if (packageName === 'playwright' && proof?.kind === 'git' && proof.path === 'pnpm-lock.yaml'
            && typeof request.version === 'string' && proof.lines.some(line => {
                const key = line.trim().replace(/^['"]|['"](?=:$)/gu, '');
                return ['playwright', '@playwright/test'].some(name =>
                    key === name + '@' + request.version + ':');
            })) {
            return { package: packageName, version: request.version, versionScope: 'tracked lockfile package entry' };
        }
        return null;
    }

    function doc(request, sha, delivered) {
        const packageName = officialPackage(request.target);
        const proof = readBasis(request.basis, sha, delivered);
        const version = versionEvidence(request, packageName, proof);
        if (!version) return { status: 'official-version-not-proven',
            ...(packageName === 'sqlite' ? { requiredBasis: { kind: 'runtime', package: packageName, prerequisite: sqliteRuntimeBasis } } : {}) };
        if (typeof request.query !== 'string' || !request.query.trim() || request.query.length > 120) return blocked('official-query');
        const supported = catalog.filter(item => item.package === packageName && item.version === version.version);
        if (!supported.length) return { status: 'official-source-unavailable', ...version };
        const sources = [];
        for (const item of supported) {
            let contents;
            try {
                contents = readFileSync(path.join(lab, item.file));
            } catch (error) {
                if (error.code === 'ENOENT') return { status: 'official-source-unavailable', ...version };
                throw error;
            }
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
            for (const range of windows) {
                sources.push({ kind: 'official', sha, ...version, sourceKind: item.kind,
                    url: item.url, commit: item.commit, sha256: item.sha256, basis: request.basis,
                    ...window(lines, range.first, range.last) });
            }
        }
        const current = page(sources, request.first ?? 1, 8);
        return current.items.length
            ? { ...grant(current.items), ...version, next: current.next }
            : { status: 'official-no-match', ...version };
    }

    function run(request, delivered) {
        if (request.first !== null && (!Number.isSafeInteger(request.first) || request.first < 1)) {
            return blocked('invalid-start');
        }
        if (request.revision === 'base' && !finding.allowBase) return blocked('base-denied');
        if (!request.target.trim() || request.target.length > 300 || /[\u0000-\u001f\u007f]/u.test(request.target)
            || !request.why.trim() || Buffer.byteLength(request.why) > 500) return blocked('invalid-query');
        const sha = request.revision === 'head' ? subject.head : subject.base;
        if (request.op === 'receipts') return { status: 'inventory', ...inventory(request.first ?? 1) };
        if (request.op === 'recall') {
            const proof = receipts.get(request.target);
            if (!proof) return blocked('receipt-unavailable');
            const first = request.first ?? proof.first, last = request.last ?? proof.last;
            if (first < proof.first || last > proof.last || first > last) return blocked('invalid-range');
            return { status: 'provided', sources: [{ ...proof, first, last, lines: proof.lines.slice(first - proof.first, last - proof.first + 1) }] };
        }
        if (request.op === 'official') return doc(request, sha, delivered);
        if (request.op === 'runtime') {
            const proof = readBasis(request.basis, sha, delivered);
            if (request.target !== 'sqlite' || sha !== subject.head) return blocked('runtime-unavailable');
            if (proof?.kind !== 'git' || proof.path !== sqliteRuntimeBasis.path || !proof.lines.includes(plan.localRuntime.python)) {
                return { status: 'runtime-basis', requiredBasis: sqliteRuntimeBasis };
            }
            return grant([{ kind: 'runtime', first: 1, last: 1, sha, basis: request.basis,
                package: 'sqlite', version: plan.localRuntime.sqlite, versionScope: plan.localRuntime.scope,
                lines: [`Python ${plan.localRuntime.python}; SQLite ${plan.localRuntime.sqlite}; ${plan.localRuntime.scope}`] }]);
        }
        if (request.scope !== null && !safePath(request.scope)) return blocked('scope-denied');
        if (request.op === 'read') {
            const value = blob(repo, sha, request.target);
            const first = request.first ?? 1, last = request.last ?? value.lines.length;
            if ((request.first === null) !== (request.last === null) || first < 1 || first > last || last > value.lines.length) {
                return { status: 'invalid-range', lineCount: value.lines.length };
            }
            return { ...grant([{ kind: 'git', sha, path: request.target, blob: value.blob, ...window(value.lines, first, last) }]),
                lineCount: value.lines.length };
        }
        const scope = request.scope ? [request.scope] : [];
        let matches;
        if (request.op === 'paths') {
            matches = git(repo, ['ls-tree', '-r', '--name-only', '-z', sha, '--', ...scope]).split('\u0000')
                .filter(file => safePath(file) && file.includes(request.target));
        } else {
            matches = git(repo, ['grep', '-n', '-I', '-F', '-e', request.target, sha, '--', ...scope], [0, 1])
                .split('\n').filter(Boolean).map(line => line.slice(41));
        }
        const current = page(matches, request.first ?? 1, 30);
        return { status: matches.length ? 'matches' : 'no-match', count: matches.length, matches: current.items, next: current.next };
    }

    function inspect(request, delivered = new Map()) {
        try { return run(request, delivered); } catch (error) {
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

    function inventory(first = 1) {
        const sources = [...receipts.values()];
        const current = page(sources, first, 30);
        return { count: sources.length, items: current.items.map(locationOf), next: current.next };
    }

    return { inspect, cite, inventory, binding };
}

function locationWithText(location, lines) {
    const { receipt, ...proof } = location;
    return { ...proof, lines };
}

module.exports = { makeBroker, officialPackage };
