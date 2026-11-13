'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { assess, limits, receipt } = require('../tree-search/contract.cjs');
const { buildRequest, scenario } = require('../tree-search/run.cjs');
const { nativeGit, sourceLimits } = require('../tree-search/git-evidence.cjs');
const { retrieve } = require('../causal-replay/retrieve.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');

const events = readFileSync(path.join(__dirname, '../module-diagnostic/trials.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const rows = events.filter(row => row.event === 'result' && row.model === 'gpt-6.1-sol' && row.subject === 'T2' && row.arm === 'on-demand');

function sourceReader(cwd, binding, charged) {
    const { sourceWallMs, gitCallMs, openedFiles, scanBytes, blobBytes, treeEntries, matches } = sourceLimits;
    const start = performance.now();
    const usage = { ...charged };
    function remaining() {
        const ms = Math.floor(sourceWallMs - charged.elapsedMs - (performance.now() - start));
        assert(ms > 0, 'combined source deadline');
        return ms;
    }
    function git(args, bytes) {
        usage.gitCalls++;
        return nativeGit(cwd, args, Math.min(gitCallMs, remaining()), bytes);
    }
    assert.equal(git(['rev-parse', binding.head + '^{tree}'], 64).trim(), binding.tree);
    function read(file, spans) {
        assert(/^[\w./-]+$/u.test(file) && file.split('/').every(part => part && !['.', '..', '.git'].includes(part.toLowerCase())));
        assert(binding.scopes.some(scope => !scope || file === scope || file.startsWith(scope + '/')));
        assert(usage.openedFiles < openedFiles && usage.matches < matches);
        const listing = git(['ls-tree', '-r', '-z', '--full-tree', binding.tree, '--', file], sourceLimits.treeBytes);
        usage.discoveryBytes += byteLength(listing);
        usage.treeEntries++;
        assert(usage.treeEntries + usage.diffEntries <= treeEntries);
        const item = /^100(?:644|755) blob ([a-f0-9]{40})\t([^\0]+)\0$/u.exec(listing);
        assert(item && item[2] === file, 'exact regular Git blob required');
        const [, blob] = item;
        const size = Number(git(['cat-file', '-s', blob], 64).trim());
        assert(Number.isSafeInteger(size) && size > 0 && size <= blobBytes);
        assert(usage.sourceBytes + usage.discoveryBytes + size <= scanBytes);
        usage.openedFiles++;
        usage.matches++;
        usage.sourceBytes += size;
        const raw = git(['cat-file', 'blob', blob], size);
        assert.equal(byteLength(raw), size);
        assert(!/[\u0000\ufffd]/u.test(raw));
        assert.equal(createHash('sha1').update(`blob ${size}\0`).update(raw).digest('hex'), blob);
        const lines = raw.replace(/\r\n/g, '\n').replace(/\n$/u, '').split('\n');
        let last = 0, count = 0;
        const ranges = spans.map(([start, end]) => {
            assert(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > last && end >= start && end <= lines.length);
            last = end;
            count += end - start + 1;
            return { start, end };
        });
        const text = ranges.map(({ start, end }) => lines.slice(start - 1, end).join('\n')).join('\n\n');
        assert(count <= sourceLimits.lines && byteLength(text) <= sourceLimits.fragmentBytes);
        return { kind: 'git', path: file, blob, ranges, text };
    }
    return { read, finish() { remaining(); return { ...usage, elapsedMs: Math.round(charged.elapsedMs + performance.now() - start) }; } };
}

function recordedPacket(row, fixture, binding, sources, causal) {
    const { receipts, ...summary } = row.lookup;
    assert.deepEqual(causal.receipts.map(({ text: _text, ...proof }) => proof), receipts);
    const followup = { request: row.evidenceRequest, ...summary, receiptIds: causal.receipts.map(item => item.id) };
    const first = buildRequest(row, fixture, binding, sources);
    const second = buildRequest(row, fixture, binding, [...sources, ...causal.receipts], followup);
    const hashes = [first, second].map(request => digest(request.prompt));
    assert.deepEqual(hashes, events.filter(item => item.event === 'attempt-started' && item.trial === row.trial)
        .map(item => item.promptSha256));
    return { prompt: second.prompt, hashes, packetBytes: byteLength(JSON.stringify({ receipts: [...sources, ...causal.receipts], followup })),
        promptBytes: byteLength(second.prompt), receipts: [...sources, ...causal.receipts], followup };
}

// Auditor-supplied locators from inspection of the pinned checkout. They are
// source selections for a feasibility control, not a new causal discovery rule.
const app = [[55, 103]];
const adapterExtra = [[20, 20], [25, 29], [30, 34], [47, 56], [350, 373], [389, 394]];
const decoder = [[159, 160], [168, 168], [184, 184], [201, 212], [218, 218], [221, 222], [402, 413], [420, 421]];
const rowsModel = [[11, 22]];

function repack(fixture, binding, causal) {
    const implementation = causal.links.find(link => link.role === 'implementation');
    const adapterPath = implementation.witnesses[0].path;
    const oldAdapter = causal.receipts.find(item => item.path === adapterPath);
    const adapterSpans = [...oldAdapter.ranges.map(range => [range.start, range.end]), ...adapterExtra]
        .sort((a, b) => a[0] - b[0]);
    const reader = sourceReader(fixture.cwd, binding, causal.budget);
    const anchored = reader.read(fixture.anchor.selected.path, app);
    const adapted = receipt(binding, reader.read(adapterPath, adapterSpans));
    assert.equal(adapted.blob, oldAdapter.blob);
    assert.match(adapted.text, /fixed_slot_for_occurrence[\s\S]*WHERE household_id=\? AND occurrence_id=\?/u);
    assert.match(adapted.text, /"state": value\.state\.value/u);
    assert.match(adapted.text, /"recurrence_rules",[\s\S]*schedule_headers\(value\)/u);
    const directory = path.posix.dirname(adapterPath);
    const decode = reader.read(directory + '/sqlite_recurrence_records.py', decoder);
    const model = reader.read(directory + '/sqlite_recurrence_rows.py', rowsModel);
    assert.match(decode.text, /ScheduleState\(cast\(str, row\["state"\]\)\)/u);
    assert.match(model.text, /value = decode\(row\["document"\]\)[\s\S]*return value/u);
    assert.match(anchored.text, /slot\.schedule\.schedule_id == schedule_id[\s\S]*if slot_key is not None:[\s\S]*return ReviewTarget\([\s\S]*actions,/u);
    // The request still presents the pinned diff. The exact source receipt
    // covers the same anchor and the effect, without a second copy to cite.
    const initial = [anchored, decode, model].map(source => receipt(binding, source));
    const receipts = causal.receipts.map(item => item.id === oldAdapter.id ? adapted : item);
    // Group exact ranges by receipt. The paths remain in the referenced proofs.
    const links = causal.links.map(link => {
        const groups = new Map();
        for (const item of link.witnesses) {
            const id = item.receiptId === oldAdapter.id ? adapted.id : item.receiptId;
            if (!groups.has(id)) groups.set(id, []);
            groups.get(id).push([item.start, item.end]);
        }
        if (link === implementation) groups.get(adapted.id).push(...adapterExtra);
        return { role: link.role, symbol: link.symbol, witnesses: [...groups].map(([receiptId, ranges]) => ({ receiptId, ranges })) };
    });
    const targets = causal.targets.map(target => ({ ...target, ...(target.receiptIds && {
        receiptIds: target.receiptIds.map(id => id === oldAdapter.id ? adapted.id : id),
    }) }));
    const result = { status: causal.status, anchor: causal.anchor, callerFlow: causal.callerFlow, links, targets, receipts };
    const evidenceBytes = byteLength(JSON.stringify(result));
    assert(evidenceBytes <= sourceLimits.evidenceBytes && receipts.length <= sourceLimits.receiptCount);
    return { initial, result: { ...result, budget: { ...reader.finish(), evidenceBytes } } };
}

async function simulate(row, fixture, binding, revised, result, request) {
    // This simulator accepts only pinned reads and an in-process response.
    const calls = [];
    const decision = await assess({ binding, receipts: revised, arm: 'on-demand',
        acquire: () => result, ask: ({ receipts, followup }) => {
            const message = buildRequest(row, fixture, binding, receipts, followup);
            const packetBytes = byteLength(JSON.stringify({ receipts, followup }));
            assert(packetBytes <= limits.packetBytes, `complete packet: ${packetBytes}`);
            assert(byteLength(message.prompt) <= limits.promptBytes);
            assert.equal(fixture.anchor.selected.line, 82);
            calls.push({ packetBytes, promptBytes: byteLength(message.prompt), receipts, followup, prompt: message.prompt });
            const envelope = { candidate: binding.candidate, reason: 'Deterministic packet audit.' };
            return followup
                ? { ...envelope, kind: 'verdict', verdict: 'inconclusive', citations: [], request: null,
                    nextStep: 'Review the source and evaluator evidence separately.' }
                : { ...envelope, kind: 'request', verdict: null, citations: [], request, nextStep: null };
        },
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].receipts.slice(0, revised.length), calls[0].receipts);
    for (const proof of calls[1].receipts) assert.deepEqual(proof, receipt(binding, proof));
    return { calls, verdict: decision.verdict, writeAttempts: [] };
}

async function audit(subjects) {
    assert.equal(rows.length, 3);
    const fixture = scenario('T2', null, subjects);
    for (const row of rows) {
        const binding = { operation: digest(`module-diagnostic/${row.model}/${row.subject}/${row.repetition}`),
            candidate: fixture.c.id + '-' + digest(JSON.stringify([fixture.c, fixture.anchor.selected, fixture.b.diffSha256])).slice(0, 12),
            head: fixture.b.head, tree: fixture.b.tree, scopes: [''] };
        const initial = [...fixture.initial, { kind: 'diff', path: fixture.c.path, text: fixture.excerpt,
            comparison: fixture.b.diffSha256 }].map(source => receipt(binding, source));
        const causal = retrieve(fixture.cwd, binding, row.evidenceRequest, {
            context: { base: fixture.b.base, anchor: fixture.anchor.selected },
        });
        const historical = recordedPacket(row, fixture, binding, initial, causal);
        const { initial: revised, result } = repack(fixture, binding, causal);
        const simulated = await simulate(row, fixture, binding, revised, result, row.evidenceRequest);
        console.log(JSON.stringify({ trial: row.trial, historical, simulated }));
    }
}

async function replayPackets(subjects, journal) {
    const cases = readFileSync(journal, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(cases.length, 12);
    const fixtures = Object.fromEntries(['T1', 'T2'].map(subject => [subject, scenario(subject, null, subjects)]));
    for (const row of cases) {
        const fixture = fixtures[row.subject];
        assert(row.sufficient);
        assert.deepEqual(row.anchor, fixture.anchor.selected);
        const { operation, candidate, head, tree } = row;
        assert.equal(fixture.b.head, head);
        assert.equal(fixture.b.tree, tree);
        const binding = { operation, candidate, head, tree, scopes: [''] };
        const initial = [...fixture.initial, { kind: 'diff', path: fixture.c.path, text: fixture.excerpt,
            comparison: fixture.b.diffSha256 }].map(source => receipt(binding, source));
        const { calls, writeAttempts } = await simulate(row, fixture, binding, initial, row.after, row.request);
        console.log(JSON.stringify({ trial: row.trial, subject: row.subject, anchor: row.anchor,
            calls: calls.map(call => ({ packetBytes: call.packetBytes, promptBytes: call.promptBytes,
                promptSha256: digest(call.prompt) })), writeAttempts }));
    }
}

if (require.main === module) {
    const [subjects, journal] = process.argv.slice(2);
    (journal ? replayPackets(subjects, journal) : audit(subjects)).catch(error => { console.error(error); process.exitCode = 1; });
}
