'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const plan = require('./plan.json');
const schema = require('./schema.cjs');
const official = require('../shadow-real-prs/official.json');
const { dryRunPorts } = require('../on-demand/contract.cjs');
const { hash } = require('../shadow-real-prs/session.cjs');
const { preflight } = require('../shadow-real-prs/run.cjs');
const { git } = require('../shadow-real-prs/broker.cjs');
const { makeBroker, officialPackage } = require('./broker.cjs');

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

function validateOfficialConclusion(answer, actions) {
    if (answer.label === 'inconclusive') return;
    // An explicit request identifies a tool premise the verifier elected to investigate.
    const investigated = new Set(actions.filter(({ request }) => request.op === 'official')
        .map(({ request }) => officialPackage(request.target)));
    for (const name of investigated) {
        assert(answer.citations.some(citation => citation.kind === 'official' && citation.package === name),
            'official-evidence-missing');
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
                const candidateAnswer = verdict(response, broker, delivered);
                validateOfficialConclusion(candidateAnswer, actions);
                answer = candidateAnswer;
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

if (require.main === module) {
    const [lab, mode] = process.argv.slice(2);
    assert.equal(mode, '--check');
    preflight(lab);
    console.log('Pinned subject trees, archived producer evidence and official sources checked.');
}
module.exports = { investigate, validateOfficialConclusion };
