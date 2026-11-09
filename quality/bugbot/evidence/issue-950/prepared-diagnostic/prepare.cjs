'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { scenario } = require('../partial-diagnostic/runner.cjs');
const { buildRequest } = require('../tree-search/run.cjs');
const { limits, receipt } = require('../tree-search/contract.cjs');
const { git } = require('../on-demand/contract.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const known = require('../module-diagnostic/held-out.lock.json');
const reserved = require('../partial-diagnostic/held-out.lock.json');

const DOMUS_TASKS = 'frontend/src/presentation/domus-tasks.ts';
const TASK_VALUES = 'frontend/src/adapters/task-values.ts';
const ENTRY = 'frontend/src/composition/entry-page.ts';

const subjects = {
    H1: { locator: ['frontend/src/domain/tasks.ts', 28, 30], pair: 'quantity' },
    H2: { locator: ['frontend/src/domain/tasks.ts', 28, 30], pair: 'quantity' },
    P1: { locator: ['frontend/src/presentation/task-messages.ts', 7, 7], pair: 'pagination' },
    P2: { locator: ['frontend/src/presentation/task-messages.ts', 7, 7], pair: 'pagination' },
};
const covers = (proof, [file, start, end]) => proof.path === file
    && (proof.ranges ?? [proof]).some(range => range.start <= start && range.end >= end);

// Select from the first actual follow-up submission in ledger order. The
// ranking uses only model and delivery, independently of verdict or citation.
function select(events, subject) {
    const rows = new Map(events.filter(row => row.event === 'result').map(row => [row.trial, row]));
    const candidates = events.filter(event => event.event === 'attempt-started' && event.round === 2
        && event.subject === subject).map(event => ({ event, row: rows.get(event.trial) }));
    const sol = candidates.filter(item => item.event.model === 'gpt-6.1-sol');
    const selected = sol.find(({ event, row }) => row?.lookup?.receipts.some(proof =>
        covers(proof, subjects[subject].locator) && event.deliveredReceiptIds.includes(proof.id)))
        ?? sol[0] ?? candidates[0];
    assert(selected?.row);
    return selected;
}

function readRanges(f, binding, file, spans, disjoint = false) {
    const lookup = binding.head + ':' + file;
    const blob = git(f.cwd, 'rev-parse', lookup).trim();
    const lines = git(f.cwd, 'show', lookup).replace(/\r\n/g, '\n').split('\n');
    const ranges = spans.map(([start, end]) => ({ start, end }));
    let previous = 0;
    const text = ranges.map(({ start, end }) => {
        assert(Number.isInteger(start) && start > previous && end >= start && end <= lines.length);
        previous = end;
        return lines.slice(start - 1, end).join('\n');
    }).join('\n\n');
    assert(ranges.reduce((n, range) => n + range.end - range.start + 1, 0) <= limits.lines);
    assert(byteLength(text) <= limits.fragmentBytes);
    return receipt(binding, { kind: 'git', path: file, blob, ...(disjoint ? { ranges } : ranges[0]), text });
}

function augment(f, binding, pair, historical) {
    const receipts = [...historical];
    if (pair === 'quantity') {
        const position = receipts.findIndex(proof => proof.kind === 'git' && proof.path === DOMUS_TASKS && proof.start === 115);
        assert(position >= 0);
        const current = receipts[position];
        const extended = readRanges(f, binding, DOMUS_TASKS, [[115, 127], [139, 139], [142, 145]], true);
        assert(extended.text.startsWith(current.text + '\n'));
        receipts[position] = extended;
        receipts.push(readRanges(f, binding, TASK_VALUES, [[68, 69]]));
    } else {
        // Add the dispatch to the existing presentation proof as a disjoint
        // range to avoid repeating its provenance in the full packet.
        const position = receipts.findIndex(proof => proof.kind === 'git' && proof.path === DOMUS_TASKS && proof.start === 185);
        assert(position >= 0);
        const current = receipts[position];
        const extended = readRanges(f, binding, DOMUS_TASKS, [[86, 86], [89, 89], [current.start, current.end]], true);
        assert(extended.text.endsWith('\n\n' + current.text));
        receipts[position] = extended;
        receipts.push(readRanges(f, binding, ENTRY, [[90, 90], [202, 202], [205, 205], [208, 208]], true));
    }
    return receipts;
}

function freezePackets(knownPath, reservedPath) {
    const events = readFileSync(path.join(__dirname, '../partial-diagnostic/trials.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const packets = {};
    for (const [subject, spec] of Object.entries(subjects)) {
        const { event, row } = select(events, subject);
        const f = subject.startsWith('H') ? scenario(subject, knownPath, known) : scenario(subject, reservedPath, reserved);
        const binding = {
            operation: digest(`partial-diagnostic/${row.model}/${row.subject}/${row.repetition}`),
            candidate: f.c.id + '-' + digest(JSON.stringify([f.c, f.anchor.selected, f.b.diffSha256])).slice(0, 12),
            head: f.b.head, tree: f.b.tree, scopes: [''],
        };
        assert.deepEqual(row.anchor, f.anchor);
        const initial = [...f.initial, { kind: 'diff', path: f.c.path, text: f.excerpt, comparison: f.b.diffSha256 }]
            .map(source => receipt(binding, source));
        const { receipts: logged, ...summary } = row.lookup;
        const recovered = logged.map(item => {
            const proof = readRanges(f, binding, item.path, [[item.start, item.end]]);
            const { text: _text, ...attestation } = proof;
            assert.deepEqual(attestation, item);
            return proof;
        });
        assert.deepEqual(event.deliveredReceiptIds, recovered.map(item => item.id));
        const historical = [...initial, ...recovered];
        const oldFollowup = { request: row.evidenceRequest, ...summary, receiptIds: event.deliveredReceiptIds };
        const complete = augment(f, binding, spec.pair, historical);
        const added = complete.filter(proof => !historical.some(old => old.id === proof.id));
        // Keep all source evidence and per-target outcomes. Run accounting
        // and the duplicate top-level receipt list are kept in the ledger.
        const { budget: _recordedBudget, receiptIds: _receiptIndex, ...augmentedFollowup } = oldFollowup;
        augmentedFollowup.request = { ...oldFollowup.request, targets: oldFollowup.request.targets.map(target =>
            Object.fromEntries(Object.entries(target).filter(([, value]) => value !== null))) };
        augmentedFollowup.results = oldFollowup.results.map(result => {
            if (result.status !== 'provided' || !result.receiptIds?.length) return result;
            const { path: _duplicatePath, ...linked } = result;
            return linked;
        });
        const byArm = {};
        for (const [arm, receipts, followup] of [
            ['historical', historical, oldFollowup], ['complete', complete, augmentedFollowup],
        ]) {
            const request = buildRequest(row, f, binding, receipts, followup);
            const packetBytes = byteLength(JSON.stringify({ receipts, followup }));
            const promptBytes = byteLength(request.prompt);
            const promptSha256 = digest(request.prompt);
            const schemaSha256 = digest(JSON.stringify(request.options.schema));
            if (arm === 'historical') {
                assert.equal(promptSha256, event.promptSha256);
                assert.equal(packetBytes, event.packetBytes);
                assert.equal(promptBytes, event.promptBytes);
                const finished = events.find(item => item.event === 'attempt-finished'
                    && item.trial === row.trial && item.attempt === event.attempt);
                assert.equal(schemaSha256, finished.fact.schemaSha256);
            }
            assert(packetBytes <= limits.packetBytes, `${subject} ${arm} complete packet: ${packetBytes}`);
            assert(promptBytes <= limits.promptBytes);
            assert(recovered.length + added.length <= limits.receiptCount);
            byArm[arm] = { prompt: request.prompt, promptSha256, schemaSha256, packetBytes, promptBytes, receipts };
        }
        packets[subject] = { pair: spec.pair, trial: row.trial, attempt: event.attempt, model: row.model,
            anchor: f.anchor, binding, ...byArm };
    }
    return packets;
}

if (require.main === module) process.stdout.write(JSON.stringify(freezePackets(...process.argv.slice(2)), null, 2) + '\n');
module.exports = { covers, select };
