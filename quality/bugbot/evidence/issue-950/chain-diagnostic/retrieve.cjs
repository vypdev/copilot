'use strict';

const { createHash } = require('node:crypto');
const { byteLength, receipt } = require('../tree-search/contract.cjs');
const { nativeGit, requestProblem, sourceLimits } = require('../tree-search/git-evidence.cjs');
const { retrieve: common } = require('../packet-audit/git-evidence.cjs');
const { follow, rangesFor, sourceRoot } = require('./typescript-chain.cjs');

const inside = (file, scope) => !scope || file === scope || file.startsWith(scope + '/');
const sourcePath = file => typeof file === 'string' && byteLength(file) <= 320 && !/[\x00-\x1f\x7f\\:]/u.test(file)
    && file.split('/').every(part => part && !['.', '..', '.git'].includes(part.toLowerCase()));
const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const out = (status, reason) => ({ status, reason });
const fail = (status, reason) => { throw Object.assign(new Error(reason), { sourceStatus: status }); };

function retrieve(cwd, binding, request, { anchor, caps = sourceLimits, runGit = nativeGit, clock = () => performance.now() } = {}) {
    if (!oid(binding.head) || !oid(binding.tree) || !Array.isArray(binding.scopes) || !binding.scopes.length
        || !binding.scopes.every(scope => scope === '' || sourcePath(scope))) throw Error('invalid-source-binding');
    const denial = requestProblem(request, binding.scopes);
    if (denial) return denial;
    const options = { caps, runGit, clock };
    if (request.kind !== 'searchTree' || !request.targets.some(target => target.match === 'literal' && target.workspace === null)
        || anchor?.side !== 'RIGHT' || !sourcePath(anchor.path) || !anchor.path.endsWith('.ts')
        || !Number.isSafeInteger(anchor.line) || anchor.line < 1 || !binding.scopes.some(scope => inside(anchor.path, scope))) {
        return common(cwd, binding, request, options);
    }

    const started = clock();
    const budget = { gitCalls: 0, treeEntries: 0, openedFiles: 0, sourceBytes: 0, matches: 0, evidenceBytes: 0 };
    const remaining = () => {
        const ms = Math.floor(caps.sourceWallMs - (clock() - started));
        if (ms < 1) fail('expired', 'source-deadline');
        return ms;
    };
    const git = (args, maxBytes) => {
        const timeout = Math.min(caps.gitCallMs, remaining());
        budget.gitCalls++;
        return runGit(cwd, args, timeout, maxBytes);
    };
    const elapsed = () => ({ ...budget, elapsedMs: Math.round(clock() - started) });
    function list(scope) {
        const entries = git(['ls-tree', '-r', '-z', '-l', '--full-tree', binding.tree, '--', ...(scope ? [scope] : [])], caps.treeBytes)
            .split('\0').filter(Boolean);
        if (entries.length > caps.treeEntries - budget.treeEntries) fail('budget', 'tree-entry-budget');
        budget.treeEntries += entries.length;
        return entries.flatMap(entry => {
            const match = /^100(?:644|755) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/u.exec(entry);
            return match && sourcePath(match[3]) && inside(match[3], scope) && binding.scopes.some(root => inside(match[3], root))
                && match[3].endsWith('.ts') && !match[3].endsWith('.d.ts')
                ? [{ path: match[3], blob: match[1], size: Number(match[2]) }] : [];
        });
    }
    const blobs = new Map();
    function read(file) {
        if (!blobs.has(file.blob)) {
            if (budget.openedFiles >= caps.openedFiles) fail('budget', 'opened-file-budget');
            if (!Number.isSafeInteger(file.size) || file.size > caps.blobBytes || budget.sourceBytes + file.size > caps.scanBytes) {
                fail('budget', 'scan-byte-budget');
            }
            budget.openedFiles++;
            budget.sourceBytes += file.size;
            const raw = git(['cat-file', 'blob', file.blob], Math.max(1, file.size));
            if (byteLength(raw) !== file.size || createHash('sha1').update(`blob ${file.size}\0`).update(raw).digest('hex') !== file.blob) {
                fail('unavailable', 'blob-integrity');
            }
            if (/[\0\ufffd]/u.test(raw)) fail('unavailable', 'non-text-blob');
            blobs.set(file.blob, raw.replace(/\r\n/g, '\n'));
        }
        return { ...file, text: blobs.get(file.blob) };
    }
    function fallback(chainReason) {
        const result = common(cwd, binding, request, { ...options, caps: { ...caps, sourceWallMs: remaining(),
            treeEntries: caps.treeEntries - budget.treeEntries, openedFiles: caps.openedFiles - budget.openedFiles,
            scanBytes: caps.scanBytes - budget.sourceBytes } });
        if (result.budget) for (const key of Object.keys(budget)) budget[key] += result.budget[key];
        return { ...result, ...(chainReason && { chainReason }), budget: elapsed() };
    }

    try {
        if (git(['rev-parse', binding.head + '^{tree}'], 64).trim() !== binding.tree) {
            return out('denied', 'revision-tree-mismatch');
        }
        const entry = list(anchor.path).find(file => file.path === anchor.path);
        if (!entry) return fallback();
        const start = read(entry);
        const root = sourceRoot(entry.path, start.text, anchor.line);
        if (root === undefined || !binding.scopes.some(scope => inside(root, scope))) return fallback();
        const files = new Map(list(root).map(file => [file.path, read(file)]));
        const chain = follow(files, anchor, request);
        remaining();
        if (!chain?.spans) return fallback(chain?.reason);

        const receipts = chain.spans.map(item => {
            const file = files.get(item.file.fileName.slice(1));
            const ranges = rangesFor(item);
            const lines = file.text.split('\n');
            const text = ranges.map(({ start, end }) => lines.slice(start - 1, end).join('\n')).join('\n\n');
            if (ranges.reduce((n, range) => n + range.end - range.start + 1, 0) > caps.lines || byteLength(text) > caps.fragmentBytes) {
                fail('budget', 'fragment-byte-budget');
            }
            return receipt(binding, { kind: 'git', path: file.path, blob: file.blob, ...(ranges.length === 1 ? ranges[0] : { ranges }), text });
        });
        const bytes = receipts.reduce((n, item) => n + byteLength(JSON.stringify(item)), 0);
        if (receipts.length > caps.receiptCount || bytes > caps.evidenceBytes) fail('budget', 'evidence-packet-budget');
        budget.evidenceBytes = bytes;

        const results = request.targets.map(target => {
            const matched = receipts.filter(item => target.workspace === null && inside(item.path, target.scope)
                && (target.match === 'literal' ? item.text.includes(target.query) : item.path.split('/').at(-1) === target.query));
            if (matched.length > caps.matches - budget.matches) fail('budget', 'match-budget');
            budget.matches += matched.length;
            return matched.length ? { status: 'provided', receiptIds: matched.map(item => item.id) }
                : out('unresolved', 'outside-resolved-chain');
        });
        remaining();
        return { status: results.every(item => item.status === 'provided') ? 'provided' : 'partial',
            chain: 'typescript-form', results, receipts, budget: elapsed() };
    } catch (failure) {
        if (failure.code === 'ETIMEDOUT') return { ...out('expired', 'source-deadline'), budget: elapsed() };
        if (failure.code === 'ENOBUFS') return { ...out('budget', 'git-output-budget'), budget: elapsed() };
        return { ...out(failure.sourceStatus ?? 'unavailable', failure.sourceStatus ? failure.message : 'source-analysis-failed'), budget: elapsed() };
    }
}

module.exports = { retrieve };
