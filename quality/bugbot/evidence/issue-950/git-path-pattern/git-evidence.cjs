'use strict';

// Successor to the common adapter frozen by the measured pilots in packet-audit.

const { createHash } = require('node:crypto');
const { matchesGlob } = require('node:path');
const { load, JSON_SCHEMA } = require('js-yaml');
const { byteLength } = require('../v4/verification.cjs');
const { receipt } = require('../on-demand/contract.cjs');
const { nativeGit, sourceLimits } = require('../tree-search/git-evidence.cjs');
const { requestProblem, pathPattern, matchPath } = require('./path-pattern.cjs');

const pathOK = value => typeof value === 'string' && byteLength(value) <= 320 && !/[\x00-\x1f\x7f\\:]/u.test(value)
    && (value === '' || value.split('/').every(part => part && !['.', '..', '.git'].includes(part.toLowerCase())));
const inside = (path, scope) => !scope || path === scope || path.startsWith(scope + '/');
const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const out = (status, reason) => ({ status, reason });
const fail = (status, reason) => { throw Object.assign(new Error(reason), { evidenceStatus: status }); };

function retrieve(cwd, binding, request, { runGit = nativeGit, clock = () => performance.now(), caps = sourceLimits } = {}) {
    if (!oid(binding.head) || !oid(binding.tree) || !Array.isArray(binding.scopes) || !binding.scopes.length
        || !binding.scopes.every(pathOK)) throw new Error('invalid-source-binding');
    const denial = requestProblem(request, binding.scopes);
    if (denial) return denial;
    const started = clock();
    const deadline = started + caps.sourceWallMs;
    const remaining = () => {
        const ms = Math.floor(deadline - clock());
        if (ms < 1) fail('expired', 'source-deadline');
        return ms;
    };
    let gitCalls = 0;
    const git = (args, bytes) => {
        const timeout = Math.min(caps.gitCallMs, remaining());
        gitCalls++;
        try {
            return runGit(cwd, args, timeout, bytes);
        } catch (error) {
            if (error.code === 'ETIMEDOUT') fail('expired', 'source-deadline');
            if (error.code === 'ENOBUFS') fail('budget', 'git-output-budget');
            throw error;
        }
    };
    const excerpts = new Map(), cache = new Map(), listings = new Map();
    let scanned = 0, matched = 0, listed = 0, evidenceBytes = 0;
    function list(scope) {
        if (listings.has(scope)) return listings.get(scope);
        const entries = git(['ls-tree', '-r', '-z', '--full-tree', binding.tree, '--', ...(scope ? [scope] : [])], caps.treeBytes)
            .split('\0').filter(Boolean);
        if (entries.length > caps.treeEntries - listed) {
            listed = caps.treeEntries;
            fail('budget', 'tree-entry-budget');
        }
        listed += entries.length;
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
        if (!text.includes('\ufffd') && (byteLength(text) !== size || createHash('sha1')
            .update(`blob ${size}\0`).update(text).digest('hex') !== file.blob)) fail('unavailable', 'blob-integrity');
        const lines = /[\0\ufffd]/u.test(text) ? null : text.replace(/\r\n/g, '\n').replace(/\n$/u, '').split('\n');
        cache.set(file.blob, lines);
        return lines;
    }
    function count(n) {
        if (n > caps.matches - matched) {
            matched = caps.matches;
            fail('budget', 'match-budget');
        }
        matched += n;
    }
    const textOf = (lines, start, end) => lines.slice(start - 1, end).join('\n');
    const fits = (lines, start, end) => end - start + 1 <= caps.lines
        && byteLength(textOf(lines, start, end)) <= caps.fragmentBytes;
    function window(lines, line) {
        if (!fits(lines, line, line)) fail('budget', 'fragment-byte-budget');
        let start = line, end = line;
        for (let distance = 1; distance <= caps.radius; distance++) {
            if (start === line - distance + 1 && start > 1 && fits(lines, start - 1, end)) start--;
            if (end === line + distance - 1 && end < lines.length && fits(lines, start, end + 1)) end++;
        }
        return [start, end];
    }
    function fragment(file, lines, start, end) {
        const key = JSON.stringify([file.path, file.blob, start, end]);
        if (excerpts.has(key)) return excerpts.get(key).id;
        remaining();
        if (!fits(lines, start, end)) fail('budget', 'fragment-byte-budget');
        const text = textOf(lines, start, end);
        const proof = receipt(binding, { kind: 'git', ...file, start, end, text });
        const bytes = byteLength(JSON.stringify(proof));
        if (excerpts.size >= caps.receiptCount || evidenceBytes + bytes > caps.evidenceBytes) fail('budget', 'evidence-packet-budget');
        evidenceBytes += bytes;
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
        const pattern = pathPattern(target);
        if (pattern === null) return find(target, files, resolved);

        const segments = pattern.split('/').map(segment => [...segment]);
        const filtered = files.filter(file => {
            remaining();
            if (file.path === resolved.scope) return false;
            const relative = resolved.scope ? file.path.slice(resolved.scope.length + 1) : file.path;
            return matchPath(relative, segments);
        });
        const filteredPaths = filtered.length;
        if (filteredPaths > caps.openedFiles) return { ...out('budget', 'search-file-budget'), filteredPaths };
        try {
            return { ...find(target, filtered, resolved), filteredPaths };
        } catch (failure) {
            if (!isBound(failure)) throw failure;
            return { ...out(failure.evidenceStatus, failure.message), filteredPaths };
        }
    }
    function find(target, files, resolved) {
        const select = (file, ranges) => {
            const source = { path: file.path, ...(resolved.workspace !== undefined && { workspace: resolved.workspace }) };
            const receiptIds = [];
            for (const [start, end] of ranges) {
                try {
                    receiptIds.push(fragment(file, read(file), start, end));
                } catch (failure) {
                    if (!isBound(failure)) throw failure;
                    return { status: receiptIds.length ? 'partial' : failure.evidenceStatus,
                        reason: failure.message, ...source, receiptIds };
                }
            }
            return { status: 'provided', ...source, receiptIds };
        };
        if (target.match !== 'literal') {
            const hits = target.match === 'name' ? files.filter(file => file.path.split('/').at(-1) === target.query)
                : target.match === 'pathPattern' ? files : files.filter(file => file.path === target.scope);
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
        const query = typeof target.query === 'string' ? target.query : target.query.text;
        const hits = [];
        for (const file of files) {
            const lines = read(file);
            const matches = (lines ?? []).flatMap((line, index) => line.includes(query) ? [index + 1] : []);
            count(matches.length);
            if (matches.length) hits.push({ file, lines, matches });
        }
        if (!hits.length) return out('absent', 'literal-absent');
        if (hits.length !== 1) return { ...out('ambiguous', 'multiple-files'), paths: hits.map(hit => hit.file.path) };
        const { file, lines, matches } = hits[0];
        const ranges = [];
        for (const line of matches) {
            const range = window(lines, line);
            const previous = ranges.at(-1);
            if (previous && range[0] <= previous[1] + 1 && fits(lines, Math.min(range[0], previous[0]), Math.max(range[1], previous[1]))) {
                previous[0] = Math.min(range[0], previous[0]);
                previous[1] = Math.max(range[1], previous[1]);
            } else ranges.push(range);
        }
        return select(file, ranges);
    }
    const isBound = failure => failure.evidenceStatus === 'budget' || failure.evidenceStatus === 'expired';
    const budget = () => ({ gitCalls, treeEntries: listed, openedFiles: cache.size, sourceBytes: scanned, matches: matched,
        evidenceBytes, elapsedMs: Math.round(clock() - started) });
    try {
        if (git(['rev-parse', binding.head + '^{tree}'], 64).trim() !== binding.tree) return out('denied', 'revision-tree-mismatch');
        const results = request.targets.map(target => {
            try {
                remaining();
                return lookup(target);
            } catch (failure) {
                if (!isBound(failure)) throw failure;
                return out(failure.evidenceStatus, failure.message);
            }
        });
        const status = results.every(result => result.status === 'provided') ? 'provided' : excerpts.size ? 'partial'
            : results.every(result => result.status === results[0].status) ? results[0].status : 'unresolved';
        return { status, results, receipts: [...excerpts.values()], budget: budget() };
    } catch (failure) {
        // A failed Git read, malformed source, or bad binding cannot salvage earlier receipts.
        return failure.evidenceStatus ? out(failure.evidenceStatus, failure.message) : out('unavailable', 'git-read-failed');
    }
}

module.exports = { retrieve, sourceLimits };
