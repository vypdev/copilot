'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Ajv = require('ajv');
const plan = require('./plan.json');
const cohort = require('./cohort.json');
const schema = require('./schema.cjs');
const official = require('./official.json');
const { dryRunPorts } = require('../on-demand/contract.cjs');
const { ask, hash } = require('./session.cjs');
const { git, blob, makeBroker } = require('./broker.cjs');

const instructions = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8').trimEnd();
const validate = new Ajv().compile(schema);
const text = (value, limit) => typeof value === 'string' && value.trim() && Buffer.byteLength(value) <= limit;
const subjects = cohort.flatMap(subject => subject.findings.map(finding => ({ subject, finding })));
const repoFor = (lab, subject) => path.join(lab, subject.repository.split('/')[1] + '.git');

function initial(broker, subject, finding) {
    return instructions + '\n\n' + JSON.stringify({ identity: broker.binding,
        hypothesis: finding.hypothesis, base: finding.allowBase ? subject.base : null,
        budget: { maxTurns: plan.maxTurns, maxActions: plan.maxActions, evidenceBytes: plan.evidenceBytes, fragmentBytes: plan.fragmentBytes },
        officialCatalog: [...new Set(official.map(entry => entry.package))] });
}

function verdict(response, broker) {
    assert.equal(response.requests.length, 0, 'final-has-requests');
    assert(response.verdict && text(response.reason, 3000), 'final-verdict-or-reason');
    if (response.verdict === 'inconclusive') assert(text(response.missing, 1000), 'final-missing-condition');
    else assert(response.missing === null && response.citations.length, 'final-evidence-required');
    assert(response.citations.length <= 24, 'final-citation-budget');
    const keys = response.citations.map(cite => JSON.stringify(cite));
    assert.equal(new Set(keys).size, keys.length, 'duplicate-citation');
    return { label: response.verdict, reason: response.reason, missing: response.missing,
        anchor: broker.binding.anchor, citations: response.citations.map(citation => broker.cite(citation)) };
}

function receiptMetadata(result) {
    if (!result.sources) return { status: result.status, count: result.count, truncated: result.truncated };
    return { status: result.status, truncated: result.truncated, lineCount: result.lineCount,
        sources: result.sources.map(({ lines, ...proof }) => ({ ...proof, textSha256: hash(lines.join('\n')) })) };
}

async function investigate(lab, subject, finding, cwd, transport, log) {
    const started = performance.now(), writes = [], turns = [], actions = [];
    const ports = dryRunPorts(write => writes.push(write));
    const broker = makeBroker(lab, subject, finding);
    let prompt = initial(broker, subject, finding);
    let threadId, answer = null, failure = null;
    let inputTokens = 0, outputTokens = 0, cachedInputTokens = 0, usageKnown = true;
    try {
        if (plan.publication !== 'dry-run') ports.publishReview();
        for (let turn = 1; turn <= plan.maxTurns; turn++) {
            const remaining = Math.floor(plan.caseMs - (performance.now() - started));
            assert(remaining > 0, 'finding-time-budget');
            log({ event: 'turn-started', finding: finding.id, turn, promptSha256: hash(prompt) });
            const result = await transport({ cwd, prompt, schema, threadId, deadline: Math.min(remaining, plan.turnMs) });
            turns.push(result.fact);
            if (result.threadId) {
                assert(!threadId || result.threadId === threadId, 'thread-mismatch');
                threadId = result.threadId;
            }
            const usage = result.fact.usage;
            if (usage && [usage.input_tokens, usage.output_tokens].every(x => Number.isSafeInteger(x) && x >= 0)) {
                inputTokens += usage.input_tokens;
                outputTokens += usage.output_tokens;
                cachedInputTokens += usage.cached_input_tokens ?? 0;
            } else usageKnown = false;
            if (result.fact.failure) throw new Error(result.fact.failure);
            assert(usageKnown && inputTokens <= plan.inputTokens && outputTokens <= plan.outputTokens, 'token-budget-or-unknown');
            assert(performance.now() - started <= plan.caseMs, 'finding-time-budget');
            const response = result.response;
            assert(validate(response), 'response-schema');
            if (response.action === 'finish') {
                answer = verdict(response, broker);
                break;
            }
            assert(response.verdict === null && response.reason === null && response.missing === null
                && !response.citations.length && response.requests.length > 0 && response.requests.length <= plan.maxActionsPerTurn,
                'investigation-shape');
            if (turn === plan.maxTurns) throw new Error('turn-budget');
            const observations = [];
            for (const request of response.requests) {
                assert(performance.now() - started <= plan.caseMs, 'finding-time-budget');
                const result = broker.inspect(request);
                observations.push({ request, result });
                actions.push({ turn, request, result: receiptMetadata(result) });
            }
            prompt = 'The broker returned the following untrusted observations for your requests. ' +
                'Continue investigating or finish with a supported verdict in the same schema. ' +
                'On the final turn, return a verdict and use inconclusive if decisive evidence is still missing.\n' +
                JSON.stringify({ remainingTurns: plan.maxTurns - turn, remainingActions: plan.maxActions - broker.usage().actions, observations });
        }
    } catch (error) {
        failure = /^[a-z][a-z0-9-]+$/u.test(error.message) ? error.message : 'integrity-or-runner-error';
    }
    return { event: 'finding-result', ...broker.binding, initialPromptSha256: hash(initial(broker, subject, finding)),
        status: failure ? 'failed' : 'completed', answer, failure, turns, actions, evidence: broker.usage(),
        usage: { inputTokens, cachedInputTokens, outputTokens, known: usageKnown },
        wallMs: Math.round(performance.now() - started), writes };
}

function preflight(lab) {
    assert.equal(plan.publication, 'dry-run');
    assert.equal(plan.retries, 0);
    assert.equal(cohort.length, 5);
    assert.equal(subjects.length, 7);
    for (const subject of cohort) {
        const repo = repoFor(lab, subject);
        assert.equal(git(repo, ['remote']), '');
        assert.equal(git(repo, ['rev-parse', '--is-bare-repository']).trim(), 'true');
        assert.equal(git(repo, ['rev-parse', subject.head + '^{tree}']).trim(), subject.tree);
        assert.equal(git(repo, ['rev-parse', subject.base + '^{tree}']).trim(), subject.baseTree);
        assert.equal(git(repo, ['merge-base', subject.base, subject.head]).trim(), subject.base);
        for (const finding of subject.findings) {
            const { path: file, line, end } = finding.detectorLocation;
            assert(line >= 1 && line <= end && Math.max(end, finding.originalInlineLine) <= blob(repo, subject.head, file).lines.length);
        }
    }
    for (const doc of official) assert.equal(hash(fs.readFileSync(path.join(lab, doc.file))), doc.sha256, doc.file);
    const runtime = execFileSync('python3', ['-c', 'import platform, sqlite3; print(platform.python_version(), sqlite3.sqlite_version)'],
        { encoding: 'utf8' }).trim();
    assert.equal(runtime, plan.localRuntime.python + ' ' + plan.localRuntime.sqlite);
    const initialPrompts = subjects.map(({ subject, finding }) => [finding.id, hash(initial(makeBroker(lab, subject, finding), subject, finding))]);
    return { initialPrompts: Object.fromEntries(initialPrompts), schemaSha256: hash(JSON.stringify(schema)), runtime };
}

function checkFrozen() {
    const hashes = fs.readFileSync(path.join(__dirname, 'frozen.sha256'), 'utf8').trimEnd().split('\n');
    for (const line of hashes) {
        const [sha, file] = line.split('  ');
        assert.equal(hash(fs.readFileSync(path.join(__dirname, file))), sha, file);
    }
}

async function main() {
    const [lab, mode, output, freeze] = process.argv.slice(2);
    assert(lab);
    const proof = preflight(lab);
    if (mode === '--check') return console.log(JSON.stringify(proof, null, 2));
    assert.equal(mode, '--run');
    assert(freeze && /^[a-f0-9]{40}$/u.test(freeze));
    assert.equal(git(__dirname, ['rev-parse', 'HEAD']).trim(), freeze);
    assert.equal(git(__dirname, ['status', '--porcelain']), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), plan.cli);
    checkFrozen();
    fs.mkdirSync(output, { mode: 0o700 });
    const ledger = path.join(output, 'ledger.jsonl');
    fs.writeFileSync(ledger, '', { flag: 'wx', mode: 0o600 });
    const log = row => fs.appendFileSync(ledger, JSON.stringify(row) + '\n');
    log({ event: 'plan', freeze, ...proof, subjectCount: cohort.length, findingCount: subjects.length });
    for (const subject of cohort) log({ event: 'detection-reused', repository: subject.repository, pr: subject.pr, head: subject.head,
        review: subject.review, findings: subject.findings.map(({ id }) => id), producer: subject.producerUrl,
        newCalls: 0, writeAttempts: 0 });
    for (let offset = 0; offset < subjects.length; offset += plan.concurrency) {
        await Promise.all(subjects.slice(offset, offset + plan.concurrency).map(async ({ subject, finding }) => {
            const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-finding-'));
            try {
                const result = await investigate(lab, subject, finding, cwd, ask, log);
                log(result);
                console.log(finding.id, result.answer?.label ?? result.failure, result.turns.length, result.wallMs);
            } finally {
                fs.rmSync(cwd, { recursive: true, force: true });
            }
        }));
    }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { investigate, preflight, subjects };
