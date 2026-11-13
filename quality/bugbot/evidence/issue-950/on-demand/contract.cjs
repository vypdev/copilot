'use strict';

const { execFileSync } = require('node:child_process');
const { byteLength, digest, limits: v4 } = require('../v4/verification.cjs');

const limits = Object.freeze({
    ...v4, verifierCalls: 3, callWallMs: 42_000, sourceMs: 2000,
    sourceBytes: 256 * 1024, receiptBytes: 4800, lines: 80, searchRadius: 19,
});
const verdicts = ['confirmed', 'refuted', 'inconclusive'];
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '--no-replace-objects', '--literal-pathspecs', ...args], {
    encoding: 'utf8', timeout: limits.sourceMs, maxBuffer: limits.sourceBytes, stdio: ['ignore', 'pipe', 'pipe'],
});
const sourcePath = path => typeof path === 'string' && byteLength(path) <= 320
    && !/[\x00-\x1f\x7f\\:]/u.test(path)
    && path.split('/').every(part => part && !['.', '..', '.git'].includes(part.toLowerCase()));
const lineNumber = value => Number.isSafeInteger(value) && value > 0;
const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const keys = (object, names) => object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).sort().join(',') === names.split(',').sort().join(',');
const error = (code) => Object.assign(new Error(code), { code });
const outcome = (status, reason) => ({ status, reason });

function selectAnchor(original, patch) {
    const groups = [];
    let group = null;
    let right = 0;
    for (const line of patch.split('\n')) {
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
        if (hunk) { right = Number(hunk[1]); group = null; continue; }
        if (!right || line.startsWith('\\')) continue;
        if (line.startsWith('+') || line.startsWith('-')) {
            if (!group) { group = { start: right, additions: [] }; groups.push(group); }
            if (line.startsWith('+')) group.additions.push({ line: right++, text: line.slice(1) });
        } else {
            if (line.startsWith(' ')) {
                if (group && !group.additions.length) group.neighbor = right;
                right++;
            }
            group = null;
        }
    }
    const substantive = entry => /[\p{L}\p{N}_]/u.test(entry.text);
    const finish = (entry, reason) => ({ original, selected: entry ? { ...original, line: entry.line } : null, reason });
    const match = groups.find(g => g.additions.some(a => a.line === original.line) || g.neighbor === original.line);
    const exact = match?.additions.find(a => a.line === original.line);
    if (match?.neighbor === original.line) return finish({ line: original.line }, 'deletion-neighbor');
    const separator = exact && /^[\s*,]+$/u.test(exact.text);
    if (exact && !separator) return finish(exact, 'original-changed');
    const near = entry => Math.abs(entry.line - original.line) <= 2;
    const possible = (match ? [match] : groups).flatMap(g => g.additions.filter(a => substantive(a) && near(a)));
    if (possible.length === 1) return finish(possible[0], 'unique-nearby');
    if (possible.length > 1) return finish(null, 'ambiguous');
    return exact ? finish(exact, 'original-only-change') : finish(null, 'unavailable');
}

function checkRequest(request) {
    if (request?.kind === 'readBlob' && keys(request, 'kind,path,start,end,query') && request.query === null
        && lineNumber(request.start) && lineNumber(request.end) && request.end >= request.start) {
        if (request.end - request.start + 1 > limits.lines) return 'candidate-budget';
        return sourcePath(request.path) ? null : 'path-denied';
    }
    if (request?.kind === 'searchFile' && keys(request, 'kind,path,start,end,query') && request.start === null && request.end === null
        && typeof request.query === 'string' && request.query.trim() && !/[\x00-\x1f\x7f]/u.test(request.query)) {
        if (byteLength(request.query) > 100) return 'candidate-budget';
        return sourcePath(request.path) ? null : 'path-denied';
    }
    return 'request-shape';
}

function retrieve(cwd, binding, request, runGit = git) {
    const denial = checkRequest(request);
    if (denial) return outcome(denial === 'candidate-budget' ? 'budget' : 'denied', denial);
    if (!oid(binding.head) || !oid(binding.tree)) throw error('invalid-source-binding');
    let entry, text;
    try {
        entry = runGit(cwd, 'ls-tree', '-z', '--full-tree', binding.tree, '--', request.path);
        if (!entry) return outcome('absent', 'path-absent');
        const match = /^100(?:644|755) blob ([a-f0-9]{40})\t([^\0]+)\0$/u.exec(entry);
        if (!match || match[2] !== request.path) return outcome('denied', 'non-regular-path');
        const blob = match[1];
        const size = Number(runGit(cwd, 'cat-file', '-s', blob).trim());
        if (!Number.isSafeInteger(size) || size > limits.sourceBytes) return outcome('budget', 'blob-byte-budget');
        text = runGit(cwd, 'cat-file', 'blob', blob);
        if (text.includes('\0') || text.includes('\ufffd')) return outcome('denied', 'non-text-blob');
        const lines = text.replace(/\r\n/g, '\n').replace(/\n$/u, '').split('\n');
        let { start, end } = request;
        if (request.kind === 'searchFile') {
            const matches = lines.flatMap((line, i) => line.includes(request.query) ? [i + 1] : []);
            if (!matches.length) return outcome('absent', 'literal-absent');
            if (matches.at(-1) - matches[0] + 1 > limits.lines) return outcome('budget', 'match-span-budget');
            const radius = Math.min(limits.searchRadius, Math.floor((limits.lines - (matches.at(-1) - matches[0] + 1)) / 2));
            start = Math.max(1, matches[0] - radius);
            end = Math.min(lines.length, matches.at(-1) + radius);
        }
        if (start > lines.length) return outcome('absent', 'range-absent');
        end = Math.min(end, lines.length);
        const fragment = lines.slice(start - 1, end).join('\n');
        if (byteLength(fragment) > limits.receiptBytes) return outcome('budget', 'receipt-byte-budget');
        return { status: 'provided', receipt: receipt(binding, {
            kind: 'git', path: request.path, blob, start, end, text: fragment,
        }) };
    } catch (failure) {
        if (failure.code === 'ETIMEDOUT') return outcome('expired', 'source-read-timeout');
        return outcome('unavailable', 'git-read-failed');
    }
}

function receipt(binding, source) {
    const { operation, candidate, head, tree } = binding;
    const provenance = { ...source, operation, candidate, head, tree, artifact: digest(source.text) };
    delete provenance.id;
    return { ...provenance, id: 'r-' + digest(JSON.stringify(provenance)).slice(0, 24) };
}

const field = type => ({ type });
const nullable = type => ({ type: [type, 'null'] });
function schema(allowRequest) {
    const types = allowRequest ? ['verdict', 'request'] : ['verdict'];
    const properties = {
        candidate: field('string'), kind: { enum: types, type: 'string' },
        verdict: { enum: [...verdicts, null], type: ['string', 'null'] },
        citations: { type: 'array', items: field('string') }, reason: field('string'),
        nextStep: nullable('string'),
        request: { type: ['object', 'null'], additionalProperties: false,
            required: ['kind', 'path', 'start', 'end', 'query'], properties: {
                kind: { enum: ['readBlob', 'searchFile'], type: 'string' }, path: field('string'),
                start: nullable('integer'), end: nullable('integer'), query: nullable('string'),
            } },
    };
    return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

function validate(response, binding, receipts, allowRequest) {
    const { required } = schema(allowRequest);
    if (!keys(response, required.join(',')) || response.candidate !== binding.candidate
        || typeof response.reason !== 'string' || !response.reason.trim() || byteLength(response.reason) > 1400
        || !Array.isArray(response.citations)) throw error('invalid-response');
    if (response.kind === 'request') {
        if (!allowRequest) throw error('second-request');
        if (!response.request || response.verdict !== null || response.nextStep !== null || response.citations.length) {
            throw error('invalid-request-envelope');
        }
        return response;
    }
    if (response.kind !== 'verdict' || !verdicts.includes(response.verdict) || response.request !== null) throw error('invalid-verdict');
    const ids = new Set(response.citations);
    if (ids.size !== response.citations.length) throw error('duplicate-citation');
    for (const id of ids) {
        const proof = receipts.find(item => item.id === id);
        if (!proof || proof.operation !== binding.operation || proof.candidate !== binding.candidate
            || proof.head !== binding.head || proof.tree !== binding.tree || proof.id !== receipt(binding, proof).id) {
            throw error('citation-integrity');
        }
    }
    if (response.verdict !== 'inconclusive' && (!ids.size || response.nextStep !== null)) throw error('missing-witness');
    if (response.verdict === 'inconclusive' && (typeof response.nextStep !== 'string'
        || !response.nextStep.trim() || byteLength(response.nextStep) > 800)) throw error('missing-next-step');
    return response;
}

const inconclusive = (binding, reason, nextStep) => ({
    candidate: binding.candidate, kind: 'verdict', verdict: 'inconclusive',
    citations: [], reason, nextStep, request: null,
});

function dryRunPorts(onAttempt) {
    return new Proxy(Object.create(null), { get: (_target, operation) => () => {
        onAttempt(String(operation));
        throw error('dry-run-write-port');
    } });
}

async function assess({ binding, receipts, arm, ask, acquire, onRequest = () => {}, onEvidence = () => {} }) {
    const first = validate(await ask({ receipts }), binding, receipts, true);
    if (first.kind === 'verdict') return first;
    onRequest(first.request);
    if (arm === 'fixed') return inconclusive(binding, 'single-call-limit', 'Inspect the requested material evidence.');
    const denial = checkRequest(first.request);
    const lookup = denial ? outcome(denial === 'candidate-budget' ? 'budget' : 'denied', denial)
        : arm === 'repeat' ? outcome('withheld', 'control-no-new-evidence') : acquire(first.request);
    onEvidence(lookup);
    const nextReceipts = lookup.receipt ? [...receipts, lookup.receipt] : receipts;
    const final = validate(await ask({ receipts: nextReceipts, followup: { request: first.request, ...lookup, receipt: lookup.receipt?.id } }),
        binding, nextReceipts, false);
    return final;
}

module.exports = { assess, checkRequest, dryRunPorts, git, limits, receipt, retrieve, schema, selectAnchor, validate };
