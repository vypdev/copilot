'use strict';

const { execFileSync } = require('node:child_process');
const { matchesGlob } = require('node:path');
const { load, JSON_SCHEMA } = require('js-yaml');
const { byteLength } = require('../v4/verification.cjs');
const { receipt } = require('../on-demand/contract.cjs');

const sourceLimits = Object.freeze({
    sourceWallMs: 4000, gitCallMs: 1500, treeEntries: 4096, openedFiles: 80, matches: 16,
    scanBytes: 512 * 1024, blobBytes: 96 * 1024, treeBytes: 512 * 1024, maxTargets: 3,
    receiptCount: 5, evidenceBytes: 9000, fragmentBytes: 4400, lines: 80, radius: 19,
});
const pathOK = value => typeof value === 'string' && byteLength(value) <= 320 && !/[\x00-\x1f\x7f\\:]/u.test(value)
    && (value === '' || value.split('/').every(part => part && !['.', '..', '.git'].includes(part.toLowerCase())));
const inside = (path, scope) => !scope || path === scope || path.startsWith(scope + '/');
const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const keys = (object, names) => object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).sort().join(',') === names;
const out = (status, reason) => ({ status, reason });
const fail = (status, reason) => { throw Object.assign(new Error(reason), { evidenceStatus: status }); };

function requestProblem(request, scopes) {
    if (!keys(request, 'kind,targets') || !['readBlob', 'searchTree'].includes(request.kind)
        || !Array.isArray(request.targets) || !request.targets.length) return out('denied', 'request-shape');
    if (request.targets.length > sourceLimits.maxTargets) return out('budget', 'target-budget');
    if (request.kind === 'readBlob' && request.targets.length !== 1) return out('denied', 'request-shape');
    for (const target of request.targets) {
        if (!keys(target, 'end,match,query,scope,start,workspace') || !pathOK(target.scope)
            || !scopes.some(scope => inside(target.scope, scope))) return out('denied', 'scope-denied');
        if (target.workspace !== null && (typeof target.workspace !== 'string'
            || !/^(?:@[a-z\d._-]+\/)?[a-z\d._-]+$/u.test(target.workspace) || byteLength(target.workspace) > 120)) {
            return out('denied', 'workspace-denied');
        }
        if (request.kind === 'readBlob') {
            if (target.match !== 'lines' || !target.scope || target.workspace !== null || target.query !== null
                || !positive(target.start) || !positive(target.end) || target.end < target.start) return out('denied', 'request-shape');
            if (target.end - target.start + 1 > sourceLimits.lines) return out('budget', 'line-budget');
        } else {
            if (!['name', 'literal'].includes(target.match) || target.start !== null || target.end !== null
                || typeof target.query !== 'string' || !target.query.trim() || /[\x00-\x1f\x7f]/u.test(target.query)
                || (target.match === 'name' && (!pathOK(target.query) || target.query.includes('/')))) return out('denied', 'request-shape');
            if (byteLength(target.query) > 120) return out('budget', 'query-budget');
        }
    }
    return null;
}

function nativeGit(cwd, args, timeout, maxBuffer) {
    return execFileSync('git', ['-C', cwd, '--no-replace-objects', '--literal-pathspecs', ...args],
        { encoding: 'utf8', timeout, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] });
}

function retrieve(cwd, binding, request, { runGit = nativeGit, clock = () => performance.now(), caps = sourceLimits } = {}) {
    if (!oid(binding.head) || !oid(binding.tree) || !Array.isArray(binding.scopes) || !binding.scopes.length
        || !binding.scopes.every(pathOK)) throw new Error('invalid-source-binding');
    const denial = requestProblem(request, binding.scopes);
    if (denial) return denial;
    const deadline = clock() + caps.sourceWallMs;
    const remaining = () => {
        const ms = Math.floor(deadline - clock());
        if (ms < 1) fail('expired', 'source-deadline');
        return ms;
    };
    const git = (args, bytes) => {
        const result = runGit(cwd, args, Math.min(caps.gitCallMs, remaining()), bytes);
        remaining();
        return result;
    };
    const excerpts = new Map(), cache = new Map(), listings = new Map();
    let scanned = 0, matched = 0, listed = 0, evidenceBytes = 0;
    function list(scope) {
        if (listings.has(scope)) return listings.get(scope);
        const entries = git(['ls-tree', '-r', '-z', '--full-tree', binding.tree, '--', ...(scope ? [scope] : [])], caps.treeBytes)
            .split('\0').filter(Boolean);
        listed += entries.length;
        if (listed > caps.treeEntries) fail('budget', 'tree-entry-budget');
        const files = entries.flatMap(entry => {
            const item = /^100(?:644|755) blob ([a-f0-9]{40})\t(.+)$/u.exec(entry);
            return item && pathOK(item[2]) && inside(item[2], scope) && binding.scopes.some(root => inside(item[2], root))
                ? [{ path: item[2], blob: item[1] }] : [];
        }).sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
        listings.set(scope, files);
        return files;
    }
    function read(file) {
        if (cache.has(file.blob)) return cache.get(file.blob);
        if (cache.size >= caps.openedFiles) fail('budget', 'opened-file-budget');
        const size = Number(git(['cat-file', '-s', file.blob], 64).trim());
        if (!Number.isSafeInteger(size) || size < 0) fail('unavailable', 'invalid-blob-size');
        if (size > caps.blobBytes || scanned + size > caps.scanBytes) fail('budget', 'scan-byte-budget');
        const text = git(['cat-file', 'blob', file.blob], Math.max(1, size));
        scanned += size;
        const lines = /[\0\ufffd]/u.test(text) ? null : text.replace(/\r\n/g, '\n').replace(/\n$/u, '').split('\n');
        cache.set(file.blob, lines);
        return lines;
    }
    function count(n) {
        matched += n;
        if (matched > caps.matches) fail('budget', 'match-budget');
    }
    function fragment(file, lines, start, end) {
        const key = JSON.stringify([file.path, file.blob, start, end]);
        if (excerpts.has(key)) return excerpts.get(key).id;
        const text = lines.slice(start - 1, end).join('\n');
        if (byteLength(text) > caps.fragmentBytes) fail('budget', 'fragment-byte-budget');
        const proof = receipt(binding, { kind: 'git', ...file, start, end, text });
        evidenceBytes += byteLength(JSON.stringify(proof));
        if (excerpts.size >= caps.receiptCount || evidenceBytes > caps.evidenceBytes) fail('budget', 'evidence-packet-budget');
        excerpts.set(key, proof);
        return proof.id;
    }
    function workspace(target) {
        if (target.workspace === null) return { scope: target.scope };
        const available = binding.scopes.flatMap(list);
        const root = available.find(file => file.path === 'package.json');
        const pnpm = available.find(file => file.path === 'pnpm-workspace.yaml');
        const manifests = available.filter(file => file.path.endsWith('/package.json'));
        const json = file => JSON.parse(read(file)?.join('\n') ?? '');
        let declarations;
        if (pnpm) {
            try { declarations = load(read(pnpm)?.join('\n') ?? '', { schema: JSON_SCHEMA })?.packages; }
            catch (failure) { if (failure.name !== 'YAMLException') throw failure; }
        } else if (root) {
            try {
                const workspaces = json(root).workspaces;
                declarations = Array.isArray(workspaces) ? workspaces : workspaces?.packages;
            } catch (failure) { if (!(failure instanceof SyntaxError)) throw failure; }
        }
        if (!Array.isArray(declarations) || declarations.some(pattern => typeof pattern !== 'string' || byteLength(pattern) > 160)) {
            return out('absent', 'workspace-declaration-unavailable');
        }
        if (declarations.length > caps.openedFiles) fail('budget', 'workspace-pattern-budget');
        const patterns = declarations.map(pattern => pattern.replace(/^(!?)\.\//u, '$1').replace(/\/$/u, ''));
        const unique = [...new Map(manifests.map(file => [file.path, file])).values()];
        const candidates = unique.filter(file => {
            const dir = file.path.slice(0, -'/package.json'.length);
            if (!patterns.some(pattern => !pattern.startsWith('!') && matchesGlob(dir, pattern))
                || patterns.some(pattern => pattern.startsWith('!') && matchesGlob(dir, pattern.slice(1)))) return false;
            try { return json(file).name === target.workspace; }
            catch (failure) { if (failure instanceof SyntaxError) return false; throw failure; }
        });
        count(candidates.length);
        if (candidates.length !== 1) return candidates.length ? out('ambiguous', 'workspace-ambiguous') : out('absent', 'workspace-absent');
        const file = candidates[0];
        const directory = file.path.split('/').slice(0, -1).join('/');
        if (!inside(target.scope, directory) && !inside(directory, target.scope)) return out('denied', 'workspace-outside-scope');
        return { scope: inside(target.scope, directory) ? target.scope : directory, workspace: directory };
    }
    function lookup(target) {
        const resolved = workspace(target);
        if (resolved.status) return resolved;
        const files = list(resolved.scope);
        const select = (file, ranges) => ({ status: 'provided', path: file.path,
            ...(resolved.workspace !== undefined && { workspace: resolved.workspace }),
            receiptIds: ranges.map(([start, end]) => fragment(file, read(file), start, end)) });
        if (target.match !== 'literal') {
            const hits = target.match === 'name' ? files.filter(file => file.path.split('/').at(-1) === target.query)
                : files.filter(file => file.path === target.scope);
            count(hits.length);
            if (!hits.length) return out('absent', 'path-absent');
            if (hits.length !== 1) return { ...out('ambiguous', 'multiple-files'), paths: hits.map(file => file.path) };
            const lines = read(hits[0]);
            if (!lines) return out('denied', 'non-text-blob');
            const start = target.start ?? 1;
            const end = Math.min(lines.length, target.end ?? caps.lines);
            if (start > end) return out('absent', 'range-absent');
            return select(hits[0], [[start, end]]);
        }
        if (files.length > caps.openedFiles) fail('budget', 'search-file-budget');
        const hits = [];
        for (const file of files) {
            const lines = read(file);
            const matches = (lines ?? []).flatMap((line, index) => line.includes(target.query) ? [index + 1] : []);
            count(matches.length);
            if (matches.length) hits.push({ file, lines, matches });
        }
        if (!hits.length) return out('absent', 'literal-absent');
        if (hits.length !== 1) return { ...out('ambiguous', 'multiple-files'), paths: hits.map(hit => hit.file.path) };
        const { file, lines, matches } = hits[0];
        const ranges = [];
        for (const line of matches) {
            const range = [Math.max(1, line - caps.radius), Math.min(lines.length, line + caps.radius)];
            const previous = ranges.at(-1);
            if (previous && range[0] <= previous[1] + 1 && range[1] - previous[0] + 1 <= caps.lines) previous[1] = range[1];
            else ranges.push(range);
        }
        return select(file, ranges);
    }
    try {
        if (git(['rev-parse', binding.head + '^{tree}'], 64).trim() !== binding.tree) return out('denied', 'revision-tree-mismatch');
        const results = request.targets.map(lookup);
        remaining();
        const provided = results.filter(result => result.status === 'provided').length;
        const status = provided === results.length ? 'provided' : provided ? 'partial'
            : results.every(result => result.status === results[0].status) ? results[0].status : 'unresolved';
        return { status, results, receipts: [...excerpts.values()] };
    } catch (failure) {
        if (failure.evidenceStatus) return out(failure.evidenceStatus, failure.message);
        if (failure.code === 'ETIMEDOUT') return out('expired', 'source-deadline');
        if (failure.code === 'ENOBUFS') return out('budget', 'git-output-budget');
        return out('unavailable', 'git-read-failed');
    }
}

module.exports = { nativeGit, requestProblem, retrieve, sourceLimits };
