'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Ajv = require('ajv');
const plan = require('./plan.json');
const cohort = require('../shadow-real-prs/cohort.json');
const schema = require('./schema.cjs');
const official = require('../shadow-real-prs/official.json');
const { dryRunPorts } = require('../on-demand/contract.cjs');
const { ask } = require('./session.cjs');
const { hash } = require('../shadow-real-prs/session.cjs');
const { preflight, subjects } = require('../shadow-real-prs/run.cjs');
const { git } = require('../shadow-real-prs/broker.cjs');
const { makeBroker } = require('./broker.cjs');

const instructions = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8').trimEnd();
const validate = new Ajv().compile(schema);
const text = (value, limit) => typeof value === 'string' && value.trim() && Buffer.byteLength(value) <= limit;
const repoFor = (lab, subject) => path.join(lab, subject.repository.split('/')[1] + '.git');

function initial(broker, subject, finding) {
    return instructions + '\n\n' + JSON.stringify({ identity: broker.binding,
        hypothesis: finding.hypothesis, base: finding.allowBase ? subject.base : null,
        officialCatalog: [...new Set(official.map(entry => entry.package))] });
}

function verdict(response, broker, delivered) {
    assert.equal(response.requests.length, 0, 'final-has-requests');
    assert(response.verdict && text(response.reason, 3000), 'final-verdict-or-reason');
    if (response.verdict === 'inconclusive') assert(text(response.missing, 1000), 'final-missing-condition');
    else assert(response.missing === null && response.citations.length, 'final-evidence-required');
    const keys = response.citations.map(cite => JSON.stringify(cite));
    assert.equal(new Set(keys).size, keys.length, 'duplicate-citation');
    return { label: response.verdict, reason: response.reason, missing: response.missing,
        anchor: broker.binding.anchor, citations: response.citations.map(citation => {
            const proof = broker.cite(citation);
            assert(delivered.get(citation.receipt)?.some(range => range.first <= citation.first && range.last >= citation.last),
                'citation-not-delivered');
            return proof;
        }) };
}

function receiptMetadata(result) {
    if (!result.sources) return { status: result.status, count: result.count, next: result.next };
    return { status: result.status, next: result.next, lineCount: result.lineCount,
        sources: result.sources.map(({ lines, ...proof }) => ({ ...proof, textSha256: hash(lines.join('\n')) })) };
}

function checkTree(lab, subject, allowBase) {
    const repo = repoFor(lab, subject);
    assert(git(repo, ['rev-parse', subject.head + '^{tree}']).trim() === subject.tree, 'pinned-head-tree-mismatch');
    if (allowBase) {
        assert(git(repo, ['rev-parse', subject.base + '^{tree}']).trim() === subject.baseTree, 'pinned-base-tree-mismatch');
    }
}

function recordDelivery(delivered, observations) {
    for (const { result } of observations) {
        for (const { receipt, first, last } of result.sources ?? []) {
            const ranges = delivered.get(receipt) ?? [];
            ranges.push({ first, last });
            delivered.set(receipt, ranges);
        }
    }
}

async function investigate(lab, subject, finding, cwd, transport, log, signal) {
    const started = performance.now(), writes = [], turns = [], actions = [];
    const ports = dryRunPorts(write => writes.push(write));
    const broker = makeBroker(lab, subject, finding);
    const first = initial(broker, subject, finding);
    const delivered = new Map();
    let prompt = first, threadId, observations = [], answer = null, failure = null;
    const remaining = () => {
        assert(!signal?.aborted, 'investigation-canceled');
        const time = Math.floor(plan.caseMs - (performance.now() - started));
        assert(time > 0, 'investigation-timeout');
        return time;
    };
    try {
        if (plan.publication !== 'dry-run') ports.publishReview();
        checkTree(lab, subject, finding.allowBase);
        while (!answer) {
            const deadline = Math.min(remaining(), plan.turnMs);
            const turn = turns.length + 1;
            log({ event: 'turn-started', finding: finding.id, turn, promptSha256: hash(prompt) });
            const result = await transport({ cwd, prompt, schema, threadId, deadline, signal });
            turns.push(result.fact);
            remaining();
            if (result.threadId) assert(!threadId || result.threadId === threadId, 'thread-mismatch');
            if (result.fact.failure === 'provider-context-window' && threadId) {
                // A provider rejection may leave the latest source undelivered.
                // Keep its receipt available for recall, alongside earlier delivered sources.
                log({ event: 'provider-context-recovery', finding: finding.id, turn });
                const leads = observations.map(({ request, result }) => ({
                    op: request.op, target: request.target, why: request.why, status: result.status,
                    receipts: (result.sources ?? []).map(source => source.receipt),
                }));
                prompt = first + '\nThe provider context window filled. Resume this investigation with the same evidence identity. ' +
                    'Retrieve saved code with recall, paginate receipts for older evidence, and request narrower ranges when needed.\n' +
                    JSON.stringify({ inventory: broker.inventory(), leads });
                threadId = undefined;
                observations = [];
                continue;
            }
            if (result.fact.failure) throw new Error(result.fact.failure);
            assert(result.threadId, 'thread-unavailable');
            threadId = result.threadId;
            recordDelivery(delivered, observations);
            const response = result.response;
            assert(validate(response), 'response-schema');
            if (response.action === 'finish') {
                checkTree(lab, subject, finding.allowBase);
                answer = verdict(response, broker, delivered);
                break;
            }
            assert(response.verdict === null && response.reason === null && response.missing === null
                && !response.citations.length && response.requests.length > 0, 'investigation-shape');
            observations = [];
            for (const request of response.requests) {
                remaining();
                const result = broker.inspect(request);
                observations.push({ request, result });
                actions.push({ turn, request, result: receiptMetadata(result) });
            }
            prompt = 'The broker returned untrusted observations. Continue investigating or finish with a supported verdict.\n' +
                JSON.stringify({ observations });
        }
    } catch (error) {
        failure = /^[a-z][a-z0-9-]+$/u.test(error.message) ? error.message : 'integrity-or-runner-error';
    }
    return { event: 'finding-result', ...broker.binding, initialPromptSha256: hash(first),
        status: failure ? 'failed' : 'completed', answer, failure, turns, actions,
        wallMs: Math.round(performance.now() - started), writes };
}

async function main() {
    const [lab, mode, output, freeze] = process.argv.slice(2);
    assert(lab);
    preflight(lab);
    assert.equal(plan.publication, 'dry-run');
    if (mode === '--check') return console.log('Pinned subject trees, archived producer evidence and official sources checked.');
    assert.equal(mode, '--run');
    assert(freeze && /^[a-f0-9]{40}$/u.test(freeze));
    assert.equal(git(__dirname, ['rev-parse', 'HEAD']).trim(), freeze);
    assert.equal(git(__dirname, ['status', '--porcelain']), '');
    assert.equal(execFileSync(process.env.BUGBOT_PILOT_CODEX || 'codex', ['--version'], { encoding: 'utf8' }).trim(), plan.cli);
    fs.mkdirSync(output, { mode: 0o700 });
    const ledger = path.join(output, 'ledger.jsonl');
    fs.writeFileSync(ledger, '', { flag: 'wx', mode: 0o600 });
    const log = row => fs.appendFileSync(ledger, JSON.stringify(row) + '\n');
    log({ event: 'plan', freeze, schemaSha256: hash(JSON.stringify(schema)), subjectCount: cohort.length, findingCount: subjects.length });
    for (const subject of cohort) log({ event: 'detection-reused', repository: subject.repository, pr: subject.pr, head: subject.head,
        review: subject.review, findings: subject.findings.map(({ id }) => id), producer: subject.producerUrl,
        newCalls: 0, writeAttempts: 0 });
    const cancel = new AbortController();
    process.once('SIGINT', () => cancel.abort());
    process.once('SIGTERM', () => cancel.abort());
    for (let offset = 0; offset < subjects.length; offset += plan.concurrency) {
        await Promise.all(subjects.slice(offset, offset + plan.concurrency).map(async ({ subject, finding }) => {
            const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-finding-'));
            try {
                const result = await investigate(lab, subject, finding, cwd, ask, log, cancel.signal);
                log(result);
                console.log(finding.id, result.answer?.label ?? result.failure, result.turns.length, result.wallMs);
            } finally {
                fs.rmSync(cwd, { recursive: true, force: true });
            }
        }));
    }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { investigate };
