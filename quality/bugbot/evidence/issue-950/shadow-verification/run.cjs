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
const officialPackages = [...new Set(official.map(entry => entry.package))];

const instructions = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8').trimEnd();
const validate = new Ajv().compile(schema);
const text = (value, limit) => typeof value === 'string' && value.trim() && Buffer.byteLength(value) <= limit;
const repoFor = (lab, subject) => path.join(lab, subject.repository.split('/')[1] + '.git');

function namedOfficialPackages(...values) {
    const text = values.join(' ');
    return officialPackages.filter(name => new RegExp(
        `(?:^|[^a-z0-9])${RegExp.escape(name)}(?=[^a-z0-9]|$)`, 'iu').test(text));
}

function initial(broker, subject, finding, requiredOfficial) {
    return instructions + '\n\n' + JSON.stringify({ identity: broker.binding,
        hypothesis: finding.hypothesis, base: finding.allowBase ? subject.base : null,
        officialCatalog: officialPackages, requiredOfficial });
}

function prepareVerdict(response, broker, delivered) {
    assert.equal(response.requests.length, 0, 'final-has-requests');
    assert(response.verdict && text(response.reason, 3000), 'final-verdict-or-reason');
    if (response.verdict === 'inconclusive') assert(text(response.missing, 1000), 'final-missing-condition');
    else assert(response.missing === null, 'final-missing-condition');

    const omissions = [];
    const proofs = new Map();
    const premises = response.premises.map(({ claim, citations }, index) => {
        assert(text(claim, 1000), 'invalid-premise');
        if (!citations.length) omissions.push({ issue: 'uncited-premise', premise: index + 1 });
        const seen = new Set();
        return { claim, citations: citations.map(citation => {
            const { receipt, first, last } = citation;
            const key = JSON.stringify([receipt, first, last]);
            assert(!seen.has(key), 'duplicate-citation');
            seen.add(key);
            if (!proofs.has(key)) {
                const proof = broker.cite(citation);
                assert(delivered.get(receipt)?.some(range => range.first <= first && range.last >= last),
                    'citation-not-delivered');
                proofs.set(key, proof);
            }
            return proofs.get(key);
        }) };
    });
    if (response.verdict !== 'inconclusive' && !premises.length) omissions.push({ issue: 'missing-premises' });
    return { answer: { label: response.verdict, reason: response.reason, missing: response.missing,
        anchor: broker.binding.anchor, premises, citations: [...proofs.values()] }, omissions };
}

function receiptMetadata({ sources, ...result }) {
    const { matches: _matches, ...metadata } = result;
    return sources ? { ...metadata, sources: sources.map(({ lines, ...proof }) =>
        ({ ...proof, textSha256: hash(lines.join('\n')) })) } : metadata;
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

function missingOfficialEvidence(answer, actions, subject, requiredOfficial) {
    if (answer.label === 'inconclusive') return [];
    const investigated = new Map();
    for (const { request, result } of actions) {
        if (request.op !== 'official') continue;
        const name = officialPackage(request.target);
        const sha = request.revision === 'head' ? subject.head : subject.base;
        const key = JSON.stringify([name, sha]);
        const source = investigated.get(key) ?? { name, sha, versions: new Map() };
        if (result.version) source.versions.set(result.version, result.status);
        investigated.set(key, source);
    }
    const namedAtClosing = namedOfficialPackages(answer.reason, ...answer.premises.map(premise => premise.claim));
    for (const name of new Set([...requiredOfficial, ...namedAtClosing])) {
        const key = JSON.stringify([name, subject.head]);
        if (!investigated.has(key)) {
            investigated.set(key, { name, sha: subject.head, versions: new Map() });
        }
    }
    return [...investigated.values()].flatMap(({ name, sha, versions }) => {
        const cited = answer.citations.some(citation =>
            citation.kind === 'official' && citation.package === name && citation.sha === sha);
        return cited ? [] : [{ issue: 'official-evidence-missing', package: name, sha,
            versions: Object.fromEntries(versions) }];
    });
}

async function investigate(lab, subject, finding, cwd, transport, log, signal) {
    const started = performance.now(), writes = [], turns = [], actions = [], closures = [];
    const ports = dryRunPorts(write => writes.push(write));
    const broker = makeBroker(lab, subject, finding);
    const requiredOfficial = namedOfficialPackages(finding.hypothesis, path.basename(finding.detectorLocation.path));
    const first = initial(broker, subject, finding, requiredOfficial);
    const delivered = new Map();
    let prompt = first, threadId, observations = [], answer = null, failure = null, closureIssues = [];
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
                    JSON.stringify({ inventory: broker.inventory(), leads, closureIssues });
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
                const proposed = prepareVerdict(response, broker, delivered);
                closureIssues = [...proposed.omissions, ...missingOfficialEvidence(proposed.answer, actions, subject, requiredOfficial)];
                if (closureIssues.length) {
                    closures.push({ turn, issues: closureIssues });
                    observations = [];
                    prompt = 'The proposed verdict is still open. In this same investigation, read or recall the exact ranges ' +
                        'and submit a complete verdict. For an official-evidence issue, establish the release and request its official source. ' +
                        'If material evidence is unavailable, finish inconclusive and state the specific gap.\n' +
                        JSON.stringify({ closureIssues });
                    continue;
                }
                answer = proposed.answer;
                break;
            }
            assert(response.verdict === null && response.reason === null && response.missing === null
                && !response.premises.length && response.requests.length > 0, 'investigation-shape');
            observations = [];
            for (const request of response.requests) {
                remaining();
                const result = broker.inspect(request, delivered);
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
        status: failure ? 'failed' : 'completed', answer, failure, turns, actions, closures,
        wallMs: Math.round(performance.now() - started), writes };
}

if (require.main === module) {
    const [lab, mode] = process.argv.slice(2);
    assert.equal(mode, '--check');
    preflight(lab);
    console.log('Pinned subject trees, archived producer evidence and official sources checked.');
}
module.exports = { investigate };
