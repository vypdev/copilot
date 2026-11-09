'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ask } = require('../v4/run-pilot.cjs');
const { git, dryRunPorts } = require('../on-demand/contract.cjs');
const { byteLength, digest } = require('../v4/verification.cjs');
const { fixtures, detectorRequest, acceptDetection, freezeCandidate, buildFixed, bindings,
    sourceReader, lineRead, verify } = require('./runner.cjs');
const plan = require('./manifest.json');

function mock(respond) {
    return (message, mode, cwd, deadline) => {
        assert.equal(mode, 'closed');
        assert.equal(cwd, null);
        assert(deadline > 0 && deadline <= plan.verifier.callMs);
        const data = JSON.parse(message.prompt.slice(message.prompt.lastIndexOf('\n') + 1));
        return { response: respond(data), fact: { outcome: 'completed', turnStartedMs: 0, turnCompletions: 1,
            inspections: 0, toolTypes: [], usage: { input_tokens: 10, output_tokens: 10, cached_input_tokens: 0 },
            promptSha256: digest(message.prompt), schemaSha256: digest(JSON.stringify(message.options.schema)) } };
    };
}

async function control(subjects) {
    const fixed = {}, detector = {}, checks = {};
    let foreign;
    for (const [subject, f] of Object.entries(subjects)) {
        fixed[subject] = buildFixed(f);
        const d = detectorRequest(f);
        detector[subject] = { head: f.b.head, tree: f.b.tree, base: f.b.base, baseTree: f.baseTree,
            promptSha256: digest(d.prompt), schemaSha256: digest(JSON.stringify(d.options.schema)), promptBytes: byteLength(d.prompt) };
        const candidate = freezeCandidate(f, { findings: [] });
        const matched = freezeCandidate(f, { findings: acceptDetection({ findings: [{ file: f.c.path, line: 94,
            trigger: 'Release a drag outside the bar and click again', effect: 'The next click is swallowed', regression: true }] }, f) });
        assert.equal(matched.origin, 'detected');
        assert.equal(matched.hypothesis.anchor.line, 107);
        const readBase = lineRead('README.md', 1, 3, 'base');
        const reader = sourceReader(f, bindings(f, matched));
        assert.equal(reader.read(readBase, false).reason, 'base-not-authorized');
        const base = reader.read(readBase, true);
        assert.equal(base.status, 'provided');
        assert.equal(base.receipts[0].head, f.b.base);
        assert.equal(base.receipts[0].tree, f.baseTree);
        const row = plan.slots.find(r => r.subject === subject && r.mode === 'adaptive');
        const verdict = (data, citations) => ({ candidate: data.candidate.id, kind: 'verdict', verdict: 'inconclusive',
            citations, links: { drag: 'unknown', freshClick: 'unknown', dispatch: 'unknown' },
            missing: ['other'], reason: 'Deterministic protocol control.', nextStep: 'Check the remaining link.', request: null });
        const request = (data, read) => ({ candidate: data.candidate.id, kind: 'request', verdict: null, citations: [],
            links: null, missing: [], reason: null, nextStep: null, request: read });
        const discard = () => {};
        const follow = mock(data => {
            if (data.reads.length < 2) return request(data, data.reads.length
                ? lineRead('packages/core/src/components/tabs.ts', 70, 78) : lineRead(f.c.path, 89, 112));
            assert.equal(data.evidence.filter(proof => proof.kind === 'git').length, 2);
            const ids = data.evidence.slice(1).map(proof => proof.id);
            return verdict(data, ids);
        });
        const result = await verify(row, f, candidate, fixed[subject], discard, follow);
        assert.equal(result.status, 'completed', result.failure);
        assert.equal(result.calls.length, 3);
        assert.equal(result.reads.length, 2);
        assert.deepEqual(result.writeAttempts, []);
        assert.equal(result.sourceUsage.receipts, 2);
        assert.equal(result.anchor.line, 107);
        const extra = await verify(row, f, candidate, fixed[subject], discard, mock(data => request(data, lineRead(f.c.path, 89, 112))));
        assert.equal(extra.failure, 'extra-read-round');
        assert.equal(extra.calls.length, 3);
        const matchedRow = { ...row, mode: 'matched' };
        const paired = await Promise.all(plan.verifier.models.map(model =>
            verify({ ...matchedRow, model }, f, candidate, fixed[subject], discard,
                mock(data => verdict(data, data.evidence.slice(1).map(proof => proof.id))))));
        assert(paired.every(item => item.status === 'completed' && item.evidence.length === 5 && item.calls.length === 1));
        assert.deepEqual(paired[0].packets.map(({ deadline, ...packet }) => packet),
            paired[1].packets.map(({ deadline, ...packet }) => packet));
        const write = await verify(row, f, candidate, fixed[subject], discard, () => assert.fail('provider dispatch'), 'live');
        assert.equal(write.failure, 'dry-run-write-port');
        assert.deepEqual(write.writeAttempts, ['publishReview']);
        if (foreign) {
            const bad = await verify(matchedRow, f, candidate, fixed[subject], discard, mock(data => verdict(data, [foreign])));
            assert.equal(bad.failure, 'citation-integrity');
        }
        foreign = paired[0].evidence[1].id;
        checks[subject] = { twoRounds: result.reads.length, calls: result.calls.length, retained: result.sourceUsage.receipts,
            extraRead: extra.failure, matchedPromptSha256: paired[0].packets[0].promptSha256,
            baseAuthorization: true, writeTrap: write.failure };
    }
    return { detector, fixed, checks, foreignCitationRejected: true };
}

function preflight() {
    for (const line of fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trim().split('\n')) {
        const [hash, file] = line.split('  ');
        assert.equal(digest(fs.readFileSync(path.join(__dirname, file))), hash, file);
    }
    assert.equal(plan.publicationMode, 'dry-run');
    assert.equal(plan.adapter, 'packet-audit/git-evidence.cjs');
    assert.equal(plan.slots.length, 12);
    assert.equal(plan.detector.attempts, 1);
    assert.equal(plan.verifier.retries, 0);
    assert.equal(new Set(plan.slots.map(row => row.trial)).size, 12);
    const sdk = process.env.BUGBOT_PILOT_SDK;
    assert(sdk);
    assert.equal(git(sdk, 'rev-parse', 'HEAD').trim(), plan.sdk);
    assert.equal(git(sdk, 'status', '--porcelain', '--untracked-files=no'), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), plan.cli);
}

async function detect(subject, f, expected, journal) {
    const row = { subject, model: plan.detector.model, effort: plan.detector.effort, head: f.b.head, tree: f.b.tree };
    const request = detectorRequest(f);
    const writes = [];
    const ports = dryRunPorts(name => writes.push(name));
    let fact, output;
    try {
        if (plan.publicationMode !== 'dry-run') ports.publishReview();
        assert.equal(digest(request.prompt), expected.promptSha256);
        assert.equal(digest(JSON.stringify(request.options.schema)), expected.schemaSha256);
        journal({ ...row, event: 'detector-started', attempt: 1, ...expected });
        ({ response: output, fact } = await ask(request, 'closed', null, plan.detector.callMs));
        assert.equal(fact.promptSha256, expected.promptSha256, 'transport-drift');
        assert.equal(fact.schemaSha256, expected.schemaSha256, 'transport-drift');
        assert(!fact.toolTypes?.length && !fact.inspections, 'closed-session-tool-event');
        const usage = fact.usage;
        assert(usage && [usage.input_tokens, usage.output_tokens].every(value => Number.isSafeInteger(value) && value >= 0),
            'detector-usage-unavailable');
        assert(usage.input_tokens <= plan.ceiling.grossInputTokens && usage.output_tokens <= plan.ceiling.outputTokens,
            'detector-token-budget');
        const findings = acceptDetection(output, f);
        return { ...row, event: 'detector-result', status: 'completed', findings, outputSha256: digest(JSON.stringify(output)),
            fact, writes };
    } catch (error) {
        const failure = /^[a-z][a-z0-9-]{2,70}$/u.test(error.message) ? error.message : 'detector-contract-failed';
        return { ...row, event: 'detector-result', status: failure === 'provider-turn-timeout' ? 'expired' : 'failed', failure,
            findings: [], fact: fact ?? error.fact ?? null, ...(output && { rejectedOutputSha256: digest(JSON.stringify(output)) }), writes };
    }
}

async function main() {
    const [directory, output, freeze] = process.argv.slice(2);
    assert(directory);
    const subjects = fixtures(directory);
    if (output === '--control') {
        console.log(JSON.stringify(await control(subjects), null, 2));
        return;
    }
    preflight();
    const controls = require('./runner-control.json');
    assert.deepEqual(await control(subjects), controls);
    if (!output) {
        console.log('Pinned trees, detector prompt hashes, matched packets, two reads, citation and write guards validated.');
        return;
    }
    assert.match(freeze, /^[a-f0-9]{40}$/u);
    assert.equal(git(__dirname, 'rev-parse', 'HEAD').trim(), freeze);
    assert.equal(git(__dirname, 'status', '--porcelain'), '');
    fs.mkdirSync(output, { mode: 0o700 });
    const log = name => {
        const file = path.join(output, name);
        fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
        return row => fs.appendFileSync(file, JSON.stringify(row) + '\n');
    };
    const detections = log('detection.jsonl');
    const journal = log('trials.jsonl');
    const candidates = {};
    for (const subject of plan.subjects) {
        const detection = await detect(subject, subjects[subject], controls.detector[subject], detections);
        detections(detection);
        candidates[subject] = freezeCandidate(subjects[subject], detection);
        console.log(subject, detection.status, detection.findings.length, candidates[subject].origin);
    }
    const candidateFile = path.join(output, 'candidates.json');
    fs.writeFileSync(candidateFile, JSON.stringify({ freeze, candidates }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const frozenBytes = fs.readFileSync(candidateFile);
    const frozen = JSON.parse(frozenBytes).candidates;
    journal({ event: 'plan', freeze, candidatesSha256: digest(frozenBytes), slots: plan.slots });
    for (let start = 0; start < plan.slots.length; start += plan.verifier.models.length) {
        const pair = plan.slots.slice(start, start + plan.verifier.models.length);
        const initial = [];
        await Promise.all(pair.map(async row => {
            const result = await verify(row, subjects[row.subject], frozen[row.subject], controls.fixed[row.subject], journal,
                (message, mode, cwd, deadline) => {
                    if (!initial.some(item => item.model === row.model)) {
                        initial.push({ model: row.model, sha: digest(message.prompt) });
                        assert(initial.every(item => item.sha === initial[0].sha), 'paired-prompt-drift');
                    }
                    return ask(message, mode, cwd, deadline);
                });
            journal(result);
            console.log(row.subject, row.model, row.repetition, row.mode, result.verdict ?? result.failure);
        }));
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
