'use strict';

const { byteLength, digest } = require('../v4/verification.cjs');
const { dryRunPorts, limits: priorLimits, receipt, validate } = require('../on-demand/contract.cjs');
const { retrieve, requestProblem, sourceLimits } = require('./git-evidence.cjs');

function selectAnchor(original, patch) {
    const finish = (line, reason) => ({ original, selected: line === null ? null : { ...original, line }, reason });
    if (!Number.isSafeInteger(original.line) || original.line < 1 || !['RIGHT', 'LEFT'].includes(original.side)) {
        return finish(null, 'invalid-location');
    }
    let left = 0, right = 0, block, inHunk = false;
    const blocks = [];
    for (const line of patch.split('\n')) {
        const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
        if (hunk) {
            left = Number(hunk[1]);
            right = Number(hunk[2]);
            block = undefined;
            inHunk = true;
        } else if (!inHunk || line.startsWith('\\')) {
            continue;
        } else if (/^[+-]/u.test(line)) {
            if (!block) {
                block = { added: [], removed: [] };
                blocks.push(block);
            }
            if (line.startsWith('+')) block.added.push({ number: right++, text: line.slice(1) });
            else block.removed.push(left++);
        } else {
            if (line.startsWith(' ')) {
                if (block?.removed.length && !block.added.length) block.neighbor = right;
                left++;
                right++;
            }
            block = undefined;
        }
    }
    if (original.side === 'LEFT') {
        return blocks.some(group => group.removed.includes(original.line))
            ? finish(original.line, 'original-deletion') : finish(null, 'outside-change-block');
    }
    const group = blocks.find(item => item.neighbor === original.line || item.added.some(a => a.number === original.line));
    if (!group) return finish(null, 'outside-change-block');
    if (group.neighbor === original.line) return finish(original.line, 'deletion-neighbor');
    const exact = group.added.find(a => a.number === original.line);
    if (!/^[\s*,]+$/u.test(exact.text)) return finish(original.line, 'original-changed');
    const nearby = group.added.filter(a => /[\p{L}\p{N}_]/u.test(a.text) && Math.abs(a.number - original.line) <= 2);
    if (nearby.length === 1) return finish(nearby[0].number, 'unique-in-block');
    if (nearby.length > 1) return finish(null, 'ambiguous');
    return group.added.length === 1 && exact.text.trim()
        ? finish(original.line, 'original-only-change') : finish(null, 'no-causal-line');
}

const limits = Object.freeze({ ...priorLimits, ...sourceLimits });
const field = type => ({ type });
const nullable = type => ({ type: [type, 'null'] });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
function schema(allowRequest) {
    return object({
        candidate: field('string'), kind: { type: 'string', enum: allowRequest ? ['verdict', 'request'] : ['verdict'] },
        verdict: { type: ['string', 'null'], enum: ['confirmed', 'refuted', 'inconclusive', null] },
        citations: { type: 'array', items: field('string') }, reason: field('string'), nextStep: nullable('string'),
        request: { ...object({
            kind: { type: 'string', enum: ['readBlob', 'searchTree'] },
            targets: { type: 'array', items: object({
                scope: field('string'), workspace: nullable('string'), match: { type: 'string', enum: ['lines', 'name', 'literal'] },
                query: nullable('string'), start: nullable('integer'), end: nullable('integer'),
            }) },
        }), type: ['object', 'null'] },
    });
}

async function assess({ binding, receipts, arm, ask, acquire, onRequest = () => {}, onEvidence = () => {} }) {
    const first = validate(await ask({ receipts }), binding, receipts, true);
    if (first.kind === 'verdict') return first;
    onRequest(first.request);
    if (arm === 'fixed') {
        return { candidate: binding.candidate, kind: 'verdict', verdict: 'inconclusive', citations: [],
            reason: 'single-call-limit', nextStep: 'Inspect the requested material evidence.', request: null };
    }
    const denial = requestProblem(first.request, binding.scopes);
    const lookup = denial ?? (arm === 'repeat' ? { status: 'withheld', reason: 'control-no-new-evidence' } : acquire(first.request));
    onEvidence(lookup);
    const { receipts: added = [], ...summary } = lookup;
    const supplied = [...receipts, ...added];
    const ids = new Set(receipts.map(item => item.id));
    for (const item of added) {
        if (ids.has(item.id) || item.head !== binding.head || item.tree !== binding.tree
            || item.candidate !== binding.candidate || item.operation !== binding.operation || item.id !== receipt(binding, item).id) {
            throw Object.assign(new Error('citation-integrity'), { code: 'citation-integrity' });
        }
        ids.add(item.id);
    }
    const followup = { request: first.request, ...summary, receiptIds: added.map(item => item.id) };
    return validate(await ask({ receipts: supplied, followup }), binding, supplied, false);
}

module.exports = { assess, byteLength, digest, dryRunPorts, limits, receipt, retrieve, schema, selectAnchor };
