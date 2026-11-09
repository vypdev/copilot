'use strict';

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const instructions = readFileSync(path.join(__dirname, 'verifier-instructions.txt'), 'utf8');
const byteLength = text => Buffer.byteLength(text, 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
const limits = Object.freeze({ diffBytes: 2800, packetBytes: 15_500, promptBytes: 21_500,
    candidateBytes: 1600, verifierCalls: 4, callReservationInput: 7400, subjectInput: 32_768,
    subjectOutput: 4096, subjectWallMs: 90_000, callWallMs: 48_000, minRetryMs: 15_000, unknownInputReservation: 10_000 });
const verdicts = ['confirmed', 'refuted', 'inconclusive'];
const detectionGuidance = `Cross-check causal reachability at the actual reviewed revision. For a removed guard or early exit, trace the next operation and the reachable state the guard previously excluded, including existing callers or tests if relevant. For changed interfaces, compare the new signature with actual callers, including unchanged callers, and distinguish direct language calls from framework dispatch. Report a concrete reachable regression with a changed anchor if supported. Use the line containing the causal expression or declaration. For a changed signature, prefer the new parameter itself over a standalone separator. Anchor a deletion-only cause to the nearest surviving line of the same hunk when the output needs a head line. Prefer one candidate per root cause.\n\n`;

class ContractError extends Error {
    constructor(code) { super(code); this.code = code; }
}

function requireFact(condition, code) {
    if (!condition) throw new ContractError(code);
}

function bound(text, max) {
    if (byteLength(text) <= max) return text;
    let result = '';
    let used = 0;
    for (const point of text) {
        used += byteLength(point);
        if (used > max - 16) break;
        result += point;
    }
    return `${result} [excerpt]`;
}

function nearestHunk(finding, changes) {
    const change = changes.find(item => item.filename === finding.file);
    if (!change || !Number.isSafeInteger(finding.line) || finding.line < 1) return null;
    const hunks = change.patch.split(/(?=^@@ )/mu).filter(Boolean).flatMap(hunk => {
        const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(hunk);
        if (!match) return [];
        const start = Number(match[3]);
        const end = start + Math.max(0, Number(match[4] ?? 1) - 1);
        const distance = Math.max(start - finding.line, finding.line - end, 0);
        return [{ hunk, distance }];
    }).sort((left, right) => left.distance - right.distance);
    return hunks[0]?.distance <= 3 ? hunks[0].hunk : null;
}

function anchorFinding(finding, changes) {
    const hunk = nearestHunk(finding, changes);
    if (!hunk) return null;
    const [header, ...lines] = hunk.split('\n');
    let right = Number(/\+(\d+)/u.exec(header)[1]);
    const anchors = [];
    let additions = [], removed = false;
    for (const text of lines) {
        if (text.startsWith('+')) additions.push({ line: right++, text: text.slice(1) });
        else if (text.startsWith('-')) removed = true;
        else if (text.startsWith(' ')) {
            if (additions.length) anchors.push(...additions.map(a => ({ ...a, group: additions })));
            else if (removed) anchors.push({ line: right, text: text.slice(1), group: [] });
            additions = [];
            removed = false;
            right++;
        }
    }
    if (additions.length) anchors.push(...additions.map(a => ({ ...a, group: additions })));
    const exact = anchors.find(a => a.line === finding.line);
    if (exact) {
        const substantive = exact.group.filter(a => /[\p{L}\p{N}_]/u.test(a.text));
        const companion = /^[\s*,]+$/u.test(exact.text) && substantive.length === 1 ? substantive[0] : exact;
        return { line: companion.line, kind: companion !== exact ? 'substantive-companion' : exact.group.length ? 'changed' : 'deletion-neighbor' };
    }
    const candidates = anchors.filter(a => Math.abs(a.line - finding.line) <= 2);
    return candidates.length === 1 ? { line: candidates[0].line, kind: candidates[0].group.length ? 'nearby-changed' : 'deletion-neighbor' } : null;
}

function diffExcerpt(finding, changes) {
    const hunk = nearestHunk(finding, changes);
    if (!hunk) return null;
    if (byteLength(hunk) <= limits.diffBytes) return hunk;
    const [header, ...lines] = hunk.split('\n');
    let headLine = Number(/\+(\d+)/u.exec(header)[1]);
    const around = [];
    for (const line of lines) {
        if (Math.abs(headLine - finding.line) <= 5) around.push(line);
        if (line.startsWith('+') || line.startsWith(' ')) headLine++;
    }
    return bound(`${header}\n[excerpt near the candidate anchor]\n${around.join('\n')}`, limits.diffBytes);
}

function verifierRequest(configuration, finding, diff, receipts, render) {
    requireFact(byteLength(JSON.stringify(receipts)) <= limits.packetBytes, 'packet-byte-budget');
    requireFact(new Set(receipts.map(item => item.id)).size === receipts.length, 'duplicate-receipt');
    const choices = ['diff', ...receipts.map(item => item.id)];
    const schema = { type: 'object', additionalProperties: false,
        required: ['id', 'verdict', 'citations', 'reason'], properties: {
            id: { type: 'string', enum: ['candidate'] }, verdict: { type: 'string', enum: verdicts },
            citations: { type: 'array', items: { type: 'string', enum: choices } },
            reason: { type: 'string' },
        } };
    const candidate = {
        file: finding.file, line: finding.line,
        claim: bound(finding.title ?? '', 280), cause: bound(finding.description ?? '', 920),
        detectorEvidence: bound(finding.evidence ?? '', 360),
    };
    const prompt = `Try to falsify the one candidate. Decide whether a real regression is reachable at this comparison. Follow the causal defect even if the detector imprecisely described the mechanism. Keep separate defects separate.
Read the exact diff, call sites, existing tests and pinned language or dependency contracts. A concrete static chain from a reachable caller or input to the changed behavior can establish a defect without executing it. Confirm the narrow causal defect when that chain is sufficient. For lost guards, distinguish passing the removed rejection or reaching preparation from successfully applying or persisting effects. Distinguish source from an observed test run. A historic or adjacent CI success cannot establish behavior on a changed head. An incomplete chain or conflicting evidence is inconclusive.
Use confirmed for a supported reachable regression, refuted for a contradicted material premise, and inconclusive for a named evidence gap. Include a concise causal reason. For confirmed and refuted, cite diff or receipts whose content supports your decision. If receipts are available, cite at least one of them. Use the literal ID candidate and only available citation IDs. No additional commentary.
${render(JSON.stringify(candidate), 'candidate')}
${render(diff, 'diff')}
${render(JSON.stringify(receipts), 'receipts')}`;
    requireFact(byteLength(JSON.stringify(candidate)) <= limits.candidateBytes + 1024, 'candidate-byte-budget');
    requireFact(byteLength(prompt) <= limits.promptBytes, 'prompt-byte-budget');
    return { configuration, agentId: 'pilot-v4-verifier', options: { schema }, prompt };
}

function decide(response, findingId, receipts) {
    requireFact(response && typeof response === 'object' && !Array.isArray(response)
        && Object.keys(response).sort().join(',') === 'citations,id,reason,verdict', 'verdict-shape');
    requireFact(response.id === 'candidate', 'verdict-identity');
    requireFact(verdicts.includes(response.verdict), 'verdict-value');
    requireFact(typeof response.reason === 'string' && response.reason.trim()
        && byteLength(response.reason) <= 1400, 'verdict-reason');
    const allowed = new Set(['diff', ...receipts.map(item => item.id)]);
    requireFact(Array.isArray(response.citations) && response.citations.every(id => allowed.has(id)), 'verdict-citation');
    const citations = [...new Set(response.citations)];
    requireFact(response.verdict === 'inconclusive'
        || citations.some(id => receipts.length ? id !== 'diff' : id === 'diff'), 'verdict-missing-witness');
    return { id: findingId, verdict: response.verdict, evidence: citations, reason: response.reason };
}

function remainingVerifierBudget(calls, elapsedMs) {
    requireFact(calls.every(call => call.usage ? ['input_tokens', 'output_tokens'].every(key =>
        Number.isSafeInteger(call.usage[key]) && call.usage[key] >= 0)
        : call.outcome === 'provider-turn-timeout' && call.turnCompletions === 0), 'verifier-usage-unavailable');
    const input = calls.reduce((sum, call) => sum + (call.usage?.input_tokens ?? 0), 0);
    const output = calls.reduce((sum, call) => sum + (call.usage?.output_tokens ?? 0), 0);
    const unknown = calls.filter(call => !call.usage).length;
    requireFact(input <= limits.subjectInput && output <= limits.subjectOutput, 'verifier-token-budget');
    return calls.length < limits.verifierCalls && limits.subjectInput - input - unknown * limits.unknownInputReservation >= limits.callReservationInput
        && output < limits.subjectOutput && elapsedMs < limits.subjectWallMs;
}

function retryDeadline(fact, calls, elapsedMs) {
    if (fact?.outcome !== 'provider-turn-timeout' || fact.turnCompletions !== 0 || fact.toolTypes.length
        || calls.filter(call => call.outcome === 'provider-turn-timeout').length !== 1
        || !remainingVerifierBudget(calls, elapsedMs)) return 0;
    const remaining = Math.min(limits.callWallMs, limits.subjectWallMs - elapsedMs);
    return remaining >= limits.minRetryMs ? remaining : 0;
}

module.exports = { anchorFinding, bound, byteLength, decide, detectionGuidance, diffExcerpt, digest, instructions,
    limits, remainingVerifierBudget, requireFact, retryDeadline, verifierRequest };
