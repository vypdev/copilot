'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scenario, trial } = require('../partial-diagnostic/runner.cjs');
const { ask } = require('../v4/run-pilot.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const { git, receipt } = require('../on-demand/contract.cjs');
const { limits } = require('../tree-search/contract.cjs');
const protocol = require('./manifest.json');
const reference = require('../partial-diagnostic/manifest.json');
const locked = require('./subjects.lock.json');

const comparison = row => `reserved-navigation/${row.model}/${row.subject}/${row.repetition}`;
const fixtures = directory => Object.fromEntries(protocol.subjects.map(subject => [subject, scenario(subject, directory, locked)]));

function block(prompt, origin) {
    const marker = `[BEGIN_UNTRUSTED_DATA origin=${origin} length=`;
    const start = prompt.indexOf(marker);
    if (start === -1) return undefined;
    const end = prompt.indexOf('\n', start);
    const tag = prompt.slice(start, end);
    const terminator = / terminator=(\[END_UNTRUSTED_DATA(?:_\d+)?\])\]$/u.exec(tag)?.[1];
    assert(terminator);
    const text = prompt.slice(end + 1, prompt.indexOf('\n' + terminator, end + 1));
    assert.equal(text.length, Number(/^\d+/u.exec(tag.slice(marker.length))[0]));
    return JSON.parse(text);
}

async function control(directory) {
    const subjects = fixtures(directory);
    const groups = {}, attestations = [];
    let firstRevisionReceipt;
    const fact = { outcome: 'completed', inspections: 0, turnCompletions: 1, toolTypes: [],
        usage: { input_tokens: 10, output_tokens: 10, cached_input_tokens: 0 } };
    async function simulate(row, attack, mode = 'dry-run') {
        const fixture = subjects[row.subject];
        const calls = [], events = [];
        const target = query => ({ scope: fixture.c.path, workspace: null, match: 'literal', query, start: null, end: null });
        const typed = { kind: 'searchTree', targets: [target('#down='), target('__missing_fixture_control__')] };
        const result = await trial(row, fixture, item => events.push(item), (message, toolMode, cwd, deadline) => {
            assert.equal(toolMode, 'closed');
            assert.equal(cwd, null);
            assert(deadline > 0 && deadline <= limits.callWallMs);
            assert.deepEqual(message.configuration, { provider: 'codex', modelProvider: protocol.modelProvider,
                model: row.model, effort: protocol.effort });
            const candidate = block(message.prompt, 'frozen candidate');
            const proofs = block(message.prompt, 'application receipts');
            const followup = block(message.prompt, 'evidence request result');
            const envelope = { candidate: candidate.id, reason: 'Deterministic transport control.' };
            calls.push({ candidate, proofs, followup });
            if (calls.length === 1) {
                assert.equal(followup, undefined);
                assert.deepEqual(proofs.map(proof => proof.kind), ['diff']);
                assert(!proofs[0].text.includes('#down='));
                return { fact, response: { ...envelope, kind: 'request', verdict: null,
                    citations: [], nextStep: null, request: typed } };
            }
            assert.deepEqual(candidate, calls[0].candidate);
            assert.deepEqual(proofs.slice(0, 1), calls[0].proofs);
            assert.deepEqual(followup.request, typed);
            if (row.arm === 'repeat') {
                assert.equal(followup.status, 'withheld');
                assert.deepEqual(followup.receiptIds, []);
                assert.equal(proofs.length, 1);
            } else {
                assert.equal(row.arm, 'on-demand');
                assert.equal(followup.status, 'partial');
                assert.equal(followup.results[0].status, 'provided');
                assert.equal(followup.results[1].status, 'absent');
                const supplied = proofs.slice(1);
                assert.deepEqual(followup.receiptIds, supplied.map(item => item.id));
                for (const item of supplied) {
                    const locator = fixture.b.head + ':' + item.path;
                    const lines = git(fixture.cwd, 'show', locator).split('\n');
                    assert.equal(item.blob, git(fixture.cwd, 'rev-parse', locator).trim());
                    assert.equal(item.text, lines.slice(item.start - 1, item.end).join('\n'));
                    assert.equal(item.head, fixture.b.head);
                    assert.equal(item.tree, fixture.b.tree);
                    assert.equal(item.candidate, candidate.id);
                    assert.equal(item.operation, proofs[0].operation);
                    assert.deepEqual(receipt(item, item), item);
                }
                assert(supplied.some(item => item.path === fixture.c.path && item.start <= 93 && item.end >= 95));
                if (row.subject === 'N1') firstRevisionReceipt = supplied[0].id;
            }
            return { fact, response: { ...envelope, kind: 'verdict', verdict: 'inconclusive',
                citations: attack ? [firstRevisionReceipt] : followup.receiptIds, request: null, nextStep: 'Transport control only.' } };
        }, { publicationMode: mode, comparison: comparison(row) });
        return { result, calls, events };
    }

    for (const row of protocol.rows) {
        const { result, calls, events } = await simulate(row);
        assert.equal(result.status, 'completed', result.reason);
        assert.equal(calls.length, row.arm === 'fixed' ? 1 : 2);
        assert.deepEqual(result.writeAttempts, []);
        assert.deepEqual(result.anchor.selected, { path: subjects[row.subject].c.path, side: 'RIGHT', line: 107 });
        const first = events.find(event => event.event === 'attempt-started');
        const { candidate, proofs } = calls[0];
        const seed = { candidate, proofs, packetBytes: first.packetBytes, promptBytes: first.promptBytes, promptSha256: first.promptSha256 };
        const key = comparison(row);
        if (groups[key]) assert.deepEqual(seed, groups[key]);
        else groups[key] = seed;
        attestations.push({ trial: row.trial, rounds: calls.length, lookup: result.lookup?.status ?? null,
            recovered: result.lookup?.receipts?.length ?? 0, writes: result.writeAttempts });
    }
    assert.equal(Object.keys(groups).length, 12);
    const row = protocol.rows.find(item => item.subject === 'N2' && item.arm === 'on-demand');
    const foreign = await simulate(row, true);
    assert.equal(foreign.result.reason, 'citation-integrity');
    assert.deepEqual(foreign.result.writeAttempts, []);
    const write = await simulate(row, false, 'live');
    assert.equal(write.result.reason, 'dry-run-write-port');
    assert.deepEqual(write.result.writeAttempts, ['publishReview']);
    assert.equal(write.calls.length, 0);
    return { adapter: protocol.adapter, groups, attestations, controls: { foreignCitation: foreign.result.reason,
        writeTrap: write.result.reason, writesBeforeProvider: write.result.writeAttempts } };
}

function preflight() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    for (const field of ['sdk', 'cli', 'modelProvider', 'effort', 'models', 'arms', 'repetitions', 'concurrencyPerModel',
        'ceiling', 'packetCeiling', 'adapter', 'publicationMode']) assert.deepEqual(protocol[field], reference[field]);
    assert.equal(protocol.adapter, 'packet-audit/git-evidence.cjs');
    assert.equal(protocol.publicationMode, 'dry-run');
    assert.equal(protocol.rows.length, protocol.plannedTrials);
    assert.equal(protocol.plannedTrials, 36);
    assert.equal(new Set(protocol.rows.map(row => row.trial)).size, 36);
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), protocol.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), protocol.cli);
}

async function main() {
    const [directory, log, freeze] = process.argv.slice(2);
    assert(directory, 'Pass the disposable fixture parent directory.');
    if (log === '--control') {
        console.log(JSON.stringify(await control(directory), null, 2));
        return;
    }
    preflight();
    const verified = require('./runner-control.json');
    assert.deepEqual(await control(directory), verified);
    if (!log) {
        console.log('Frozen trees, initial packets, transport controls, SDK and CLI verified without model calls.');
        return;
    }
    const subjects = fixtures(directory);
    assert.match(freeze, /^[a-f0-9]{40}$/u);
    assert.equal(git(__dirname, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(__dirname, 'status', '--porcelain'), '');
    fs.writeFileSync(log, '', { flag: 'wx', mode: 0o600 });
    const journal = item => fs.appendFileSync(log, JSON.stringify(item) + '\n');
    journal({ event: 'plan', freeze, rows: protocol.rows });
    await Promise.all(protocol.models.flatMap(model => {
        const queue = protocol.rows.filter(row => row.model === model);
        return Array.from({ length: protocol.concurrencyPerModel }, async () => {
            let row;
            while ((row = queue.shift())) {
                let first = true;
                const seed = verified.groups[comparison(row)];
                const result = await trial(row, subjects[row.subject], journal, (message, mode, cwd, deadline) => {
                    if (first) {
                        assert.equal(digest(message.prompt), seed.promptSha256);
                        assert.equal(byteLength(message.prompt), seed.promptBytes);
                        first = false;
                    }
                    return ask(message, mode, cwd, deadline);
                }, { publicationMode: protocol.publicationMode, comparison: comparison(row) });
                journal({ ...result, event: 'result' });
                console.log(row.model, row.subject, row.arm, row.repetition, result.verdict ?? result.reason);
            }
        });
    }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
