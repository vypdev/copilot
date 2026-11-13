'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ask } = require('../v4/run-pilot.cjs');
const { byteLength, diffExcerpt, digest, remainingVerifierBudget } = require('../v4/verification.cjs');
const { assess, dryRunPorts, limits, receipt, retrieve, schema, selectAnchor } = require('./contract.cjs');
const { git } = require('../on-demand/contract.cjs');
const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const protocol = read('manifest.json');
const template = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8');
const regression = read('../on-demand/held-out.lock.json');
const held = read('held-out.lock.json');
const sdk = process.env.BUGBOT_PILOT_SDK || path.resolve(__dirname, '../../../../..');
const { renderUntrustedContentVerbatim } = require(path.join(sdk, 'src/domain/security/untrusted_content'));
const safe = (data, origin) => {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return renderUntrustedContentVerbatim({
        text, origin, originalLength: text.length, truncated: false, removedControlCharacters: false,
    });
};
const clock = () => Math.round(performance.now());

function scenario(subject, priorSubjects, newSubjects) {
    const frozen = held[subject] ?? regression[subject];
    const cwd = path.join(held[subject] ? newSubjects : priorSubjects, subject);
    const b = frozen.binding;
    const c = frozen.candidate;
    assert.equal(git(cwd, 'rev-parse', 'HEAD').trim(), b.head);
    assert.equal(git(cwd, 'rev-parse', 'HEAD^{tree}').trim(), b.tree);
    assert.equal(git(cwd, 'remote'), '');
    assert.equal(git(cwd, 'status', '--porcelain'), '');
    const diff = (...paths) => git(cwd, '-c', 'core.quotePath=true', 'diff', '--no-ext-diff', '--no-textconv',
        '--no-renames', '--unified=3', b.base, b.head, '--', ...paths);
    assert.equal(digest(diff(...b.paths)), b.diffSha256);
    assert(b.paths.includes(c.path));
    const fileDiff = diff(c.path);
    const patch = fileDiff.slice(fileDiff.indexOf('@@ '));
    const anchor = selectAnchor({ path: c.path, side: 'RIGHT', line: c.line }, patch);
    assert(anchor.selected, subject);
    const excerpt = diffExcerpt({ file: c.path, line: anchor.selected.line }, [{ filename: c.path, patch }]);
    assert(excerpt);
    for (const item of frozen.evidence) {
        assert.equal(item.head, b.head);
        if (item.kind === 'dependency') {
            assert.equal(git(cwd, 'rev-parse', b.head + ':' + item.lockPath).trim(), item.lockBlob);
            assert(git(cwd, 'show', b.head + ':' + item.lockPath).includes(item.integrity));
        } else {
            const request = { kind: 'readBlob', targets: [{ match: 'lines', scope: item.path, query: null, workspace: null,
                start: item.start, end: item.end }] };
            const result = retrieve(cwd, { ...b, scopes: [''], operation: 'attest', candidate: c.id }, request);
            assert.equal(result.receipts?.[0]?.blob, item.blob);
            assert.equal(result.receipts?.[0]?.text, item.text);
        }
    }
    return { cwd, b, c, anchor, excerpt, initial: frozen.evidence };
}

function plan() {
    const rows = [];
    for (const model of protocol.models) for (const subject of protocol.subjects)
        for (const arm of protocol.arms) for (const repetition of protocol.repetitions) {
            const trial = digest(`tree-search/${model}/${subject}/${arm}/${repetition}`).slice(0, 16);
            rows.push({ trial, model, subject, arm, repetition });
        }
    assert.equal(rows.length, 72);
    return rows.sort((a, b) => a.trial.localeCompare(b.trial));
}

function buildRequest(row, fixture, binding, receipts, followup) {
    const configuration = { provider: 'codex', modelProvider: 'openai', model: row.model, effort: 'low' };
    const header = followup ? 'Round 2. A final verdict is required.' : 'Round 1. Return a verdict or one typed request.';
    const prompt = [template, header,
        safe({ ...fixture.c, id: binding.candidate, anchor: fixture.anchor.selected, head: binding.head,
            base: fixture.b.base }, 'frozen candidate'),
        safe(fixture.excerpt, 'pinned diff'),
        safe(receipts, 'application receipts'),
        ...(followup ? [safe(followup, 'evidence request result')] : [])].join('\n\n');
    assert(byteLength(JSON.stringify(receipts)) <= limits.packetBytes, 'packet-byte-budget');
    assert(byteLength(prompt) <= limits.promptBytes, 'prompt-byte-budget');
    return { configuration, agentId: followup ? 'tree-followup' : 'tree-initial', prompt,
        options: { schema: schema(!followup) } };
}

const spent = calls => ({
    input: calls.reduce((sum, call) => sum + (call.usage?.input_tokens ?? 0), 0),
    cached: calls.reduce((sum, call) => sum + (call.usage?.cached_input_tokens ?? 0), 0),
    output: calls.reduce((sum, call) => sum + (call.usage?.output_tokens ?? 0), 0),
    unknown: calls.filter(call => !call.usage).length,
});

function remaining(calls, elapsed) {
    const cost = spent(calls);
    if (cost.input > limits.subjectInput || cost.output > limits.subjectOutput) throw Error('verifier-token-budget');
    if (elapsed > limits.subjectWallMs) throw Error('subject-wall-budget');
    return remainingVerifierBudget(calls, elapsed) && calls.length < limits.verifierCalls;
}

async function trial(row, f, journal, send = ask) {
    const calls = [], writeAttempts = [];
    const ports = dryRunPorts(name => writeAttempts.push(name));
    const operation = digest(`tree-search/${row.model}/${row.subject}/${row.repetition}`);
    const candidate = f.c.id + '-' + digest(JSON.stringify([f.c, f.anchor.selected, f.b.diffSha256])).slice(0, 12);
    const binding = { operation, candidate, head: f.b.head, tree: f.b.tree, scopes: [''] };
    const receipts = [...f.initial, { kind: 'diff', path: f.c.path, text: f.excerpt,
        comparison: f.b.diffSha256 }].map(source => receipt(binding, source));
    const start = clock();
    let lookup, evidenceRequest, retried = false, rounds = 0;
    const note = (event, data) => journal({ ...row, event, ...data });
    const submit = async request => {
        const elapsed = clock() - start;
        const deadline = Math.min(limits.callWallMs, limits.subjectWallMs - elapsed - 1200);
        if (!remaining(calls, elapsed) || deadline < limits.minRetryMs) throw Error('candidate-call-budget');
        note('attempt-started', { round: rounds, attempt: calls.length + 1, deadline,
            promptSha256: digest(request.prompt) });
        const register = (fact) => {
            const recorded = fact ?? { outcome: 'transport-failed', usage: null, turnCompletions: 0, toolTypes: [] };
            calls.push(recorded);
            note('attempt-finished', { round: rounds, attempt: calls.length, fact: recorded });
        };
        try {
            const result = await send(request, 'closed', null, deadline);
            register(result.fact);
            return result.response;
        } catch (failure) {
            register(failure.fact);
            throw failure;
        }
    };
    const query = async ({ receipts: packet, followup }) => {
        rounds++;
        const request = buildRequest(row, f, binding, packet, followup);
        try {
            return await submit(request);
        } catch (failure) {
            const fact = failure.fact;
            if (retried || fact?.outcome !== 'provider-turn-timeout' || fact.turnCompletions || fact.toolTypes.length
                || !remaining(calls, clock() - start)
                || limits.subjectWallMs - (clock() - start) < limits.minRetryMs + 1200) throw failure;
            retried = true;
            return submit(request);
        }
    };
    try {
        const decision = await assess({ binding, receipts, arm: row.arm, ask: query,
            onRequest: request => {
                evidenceRequest = request;
                note('evidence-requested', { request });
            },
            acquire: request => retrieve(f.cwd, binding, request),
            onEvidence: result => {
                const { receipts: artifacts = [], ...status } = result;
                lookup = { ...status, receipts: artifacts.map(({ text: _private, ...artifact }) => artifact) };
                note('evidence-response', { lookup });
            },
        });
        remaining(calls, clock() - start);
        if (protocol.publicationMode !== 'dry-run') ports.publishReview();
        const { reason, nextStep } = decision;
        return { ...row, status: 'completed', head: f.b.head, anchor: f.anchor, rounds, evidenceRequest, lookup,
            verdict: decision.verdict, citations: decision.citations, reasonSha256: digest(reason),
            ...(nextStep && { nextStepSha256: digest(nextStep) }), calls, ...spent(calls), wallMs: clock() - start, writeAttempts };
    } catch (failure) {
        const reason = /^[a-z][a-z0-9-]{2,70}$/u.test(failure.message) ? failure.message : 'trial-contract-failed';
        return { ...row, status: reason === 'provider-turn-timeout' ? 'expired' : 'failed', head: f.b.head,
            anchor: f.anchor, rounds, evidenceRequest, lookup, reason, calls, ...spent(calls),
            wallMs: clock() - start, writeAttempts };
    }
}

function assertFreeze() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    assert.equal(protocol.publicationMode, 'dry-run');
    assert(process.env.BUGBOT_PILOT_SDK, 'audited SDK checkout required');
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), protocol.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), protocol.cli);
}

async function main() {
    const [priorSubjects, newSubjects, journalPath] = process.argv.slice(2);
    assert(priorSubjects && newSubjects, 'Usage: node run.cjs PRIOR_SUBJECTS NEW_SUBJECTS [NEW_JOURNAL]');
    assertFreeze();
    const scenarios = Object.fromEntries(protocol.subjects.map(subject => [subject, scenario(subject, priorSubjects, newSubjects)]));
    if (!journalPath) { console.log('Four exact fixtures, closed tool policy, SDK and freeze validated.'); return; }
    assert(!fs.existsSync(journalPath), 'journal exists');
    const journal = record => fs.appendFileSync(journalPath, JSON.stringify(record) + '\n', { mode: 0o600 });
    const rows = plan();
    journal({ event: 'plan', rows });
    await Promise.all(protocol.models.flatMap(model => {
        const queue = rows.filter(row => row.model === model);
        return Array.from({ length: protocol.concurrencyPerModel }, async () => {
            let row;
            while ((row = queue.shift())) {
                const result = await trial(row, scenarios[row.subject], journal);
                journal({ ...result, event: 'result' });
                console.log(row.model, row.subject, row.arm, row.repetition, result.verdict ?? result.reason);
            }
        });
    }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { buildRequest, plan, scenario, trial };
