'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { receipt } = require('../on-demand/contract.cjs');
const { retrieve: literal, requestProblem, sourceLimits } = require('../tree-search/git-evidence.cjs');

const oid = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const sourceProgram = path.join(__dirname, 'python-source.py');

// The anchor and comparison come from the application, outside the typed request.
function retrieve(cwd, binding, request, { context, caps = sourceLimits } = {}) {
    const anchor = context?.anchor;
    const denial = requestProblem(request, binding.scopes);
    if (denial) return denial;
    if (request.kind !== 'searchTree' || !anchor?.path?.endsWith('.py')
        || request.targets.some(target => target.workspace !== null || target.match !== 'literal')) {
        return literal(cwd, binding, request, { caps });
    }
    if (!oid(binding.head) || !oid(binding.tree) || !oid(context.base)
        || anchor.side !== 'RIGHT' || !Number.isSafeInteger(anchor.line) || anchor.line < 1) {
        throw Error('invalid-source-binding');
    }
    const start = performance.now();
    let found;
    try {
        found = JSON.parse(execFileSync('python3', ['-I', '-S', sourceProgram], {
            input: JSON.stringify({ cwd, binding, request, context, caps }),
            timeout: caps.sourceWallMs, maxBuffer: 64 * 1024, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
        }));
    } catch (failure) {
        return { status: failure.code === 'ETIMEDOUT' ? 'expired' : 'unavailable',
            reason: failure.code === 'ETIMEDOUT' ? 'source-deadline' : 'source-adapter-failed',
            budget: { elapsedMs: Math.round(performance.now() - start) } };
    }
    const { fragments = [], ...result } = found;
    const receipts = fragments.map(fragment => receipt(binding, fragment));
    const byPath = new Map(receipts.map(item => [item.path, item.id]));
    if (result.links) {
        for (const link of result.links) {
            link.witnesses = link.witnesses.map(item => ({ ...item, receiptId: byPath.get(item.path) }));
        }
    }
    const targets = receipts.length ? request.targets.map(target => {
        const hits = receipts.filter(item => (!target.scope || item.path === target.scope || item.path.startsWith(target.scope + '/'))
            && item.text.includes(target.query));
        return hits.length ? { status: 'provided', receiptIds: hits.map(item => item.id) }
            : { status: 'unresolved', reason: 'outside-returned-chain' };
    }) : undefined;
    const bytes = Buffer.byteLength(JSON.stringify({ receipts, links: result.links, callerFlow: result.callerFlow, targets }));
    const elapsedMs = Math.round(performance.now() - start);
    const budget = { ...result.budget, elapsedMs, evidenceBytes: receipts.length ? bytes : 0 };
    if (elapsedMs >= caps.sourceWallMs) return { status: 'expired', reason: 'source-deadline', budget };
    if (bytes > caps.evidenceBytes) return { status: 'budget', reason: 'evidence-packet-budget', budget };
    return { ...result, ...(targets && { targets }), receipts, budget };
}

module.exports = { retrieve };
