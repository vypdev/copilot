'use strict';

const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const Ajv = require('ajv');
const schema = require('./schema.cjs');
const { git, hash } = require('./git.cjs');
const { CitationRangeError, makeBroker, officialPackage } = require('./broker.cjs');

const instructions = fs.readFileSync(path.join(__dirname, 'prompt.txt'), 'utf8').trimEnd();
const validate = new Ajv().compile(schema);
const text = (value, limit) => typeof value === 'string' && value.trim() && Buffer.byteLength(value) <= limit;
function namedOfficialPackages(officialPackages, ...values) {
    const text = values.join(' ');
    return officialPackages.filter(name => new RegExp(
        `(?:^|[^a-z0-9])${RegExp.escape(name)}(?=[^a-z0-9]|$)`, 'iu').test(text));
}

function initial(broker, subject, finding, officialPackages, requiredOfficial) {
    return instructions + '\n\n' + JSON.stringify({ identity: broker.binding,
        hypothesis: finding.hypothesis, base: finding.allowBase ? subject.base : null,
        officialCatalog: officialPackages, requiredOfficial });
}

const orderLanguage = /\b(?:before|after|precedes?|follows? the execution|prior to|followed by|and then|first.+(?:then|second)|antes de|despu[eé]s de|seguido de)\b/iu;
const orderParts = {
    first: 'the first operation',
    second: 'the second operation',
    mechanism: 'the code that determines the effective order',
};

function validateOrder(order, claim, premise, validateCitation, broker, omissions) {
    if (!order.length && orderLanguage.test(claim)) {
        omissions.push({ issue: 'order-claim-uncited', premise });
    }
    const routes = new Set();
    return order.map(({ route, ...parts }) => {
        assert(text(route, 300), 'invalid-order-route');
        assert(!routes.has(route.trim().toLowerCase()), 'duplicate-order-route');
        routes.add(route.trim().toLowerCase());
        const shas = new Set();
        const proof = { route };
        for (const part of Object.keys(orderParts)) {
            if (!parts[part].length) omissions.push({ issue: 'order-evidence-missing', premise, route, part });
            proof[part] = parts[part].flatMap(({ excerpt, ...citation }) => {
                const source = validateCitation(citation, { premise, route, part });
                if (!source) return [];
                shas.add(source.sha);
                if (source.kind !== 'git' || !text(excerpt, 300)
                    || !broker.containsExcerpt(citation, excerpt.trim())) {
                    omissions.push({ issue: 'order-excerpt-unsupported', premise, route, part });
                }
                return [{ excerpt, citation: source }];
            });
        }
        if (shas.size > 1) omissions.push({ issue: 'order-mixed-revisions', premise, route });
        return proof;
    });
}

function prepareVerdict(response, broker, delivered, subject) {
    assert.equal(response.requests.length, 0, 'final-has-requests');
    assert(response.verdict && text(response.reason, 3000), 'final-verdict-or-reason');
    if (response.verdict === 'inconclusive') assert(text(response.missing, 1000), 'final-missing-condition');
    else assert(response.missing === null, 'final-missing-condition');

    const omissions = [];
    const proofs = new Map();
    function validateCitation(citation, location) {
        const { receipt, first, last } = citation;
        const key = JSON.stringify([receipt, first, last]);
        if (!proofs.has(key)) {
            const ranges = delivered.get(receipt);
            try {
                const proof = broker.cite(citation);
                assert(ranges?.some(range => range.first <= first && range.last >= last), 'citation-not-delivered');
                proofs.set(key, proof);
            } catch (error) {
                if (!(error instanceof CitationRangeError)) throw error;
                assert(ranges?.length, 'citation-not-delivered');
                omissions.push({ issue: error.message, ...location, ...error.source, receipt,
                    requested: { first, last }, delivered: ranges.slice() });
                return null;
            }
        }
        return proofs.get(key);
    }

    const premises = response.premises.map(({ claim, citations, order }, index) => {
        assert(text(claim, 1000), 'invalid-premise');
        const premise = index + 1;
        if (!citations.length && !order.length) omissions.push({ issue: 'uncited-premise', premise });
        const direct = citations.map(citation => validateCitation(citation, { premise })).filter(Boolean);
        assert.equal(new Set(direct).size, direct.length, 'duplicate-citation');
        const routes = validateOrder(order, claim, premise, validateCitation, broker, omissions);
        const ordered = routes.flatMap(route => Object.keys(orderParts)
            .flatMap(part => route[part].map(evidence => evidence.citation)));
        return { claim, citations: [...new Set([...direct, ...ordered])], order: routes };
    });
    if (response.verdict !== 'inconclusive') {
        if (!premises.length) omissions.push({ issue: 'missing-premises' });
        if (orderLanguage.test(response.reason) && !premises.some(premise => premise.order.length)
            && !omissions.some(gap => gap.issue === 'order-claim-uncited')) {
            omissions.push({ issue: 'order-claim-uncited', field: 'reason' });
        }
    }
    const anchor = broker.binding.anchor;
    const citations = [...proofs.values()];
    if (response.verdict === 'confirmed') {
        const revision = anchor.side === 'LEFT' ? 'base' : 'head';
        const sha = subject[revision];
        if (!citations.some(citation => citation.kind === 'git' && citation.sha === sha
            && citation.path === anchor.path && citation.first <= anchor.end && citation.last >= anchor.line)) {
            omissions.push({ issue: 'anchor-evidence-missing', revision, sha, path: anchor.path,
                first: anchor.line, last: anchor.end });
        }
    }
    return { answer: { label: response.verdict, reason: response.reason, missing: response.missing,
        anchor, premises, citations }, omissions };
}

function inconclusiveOrder(broker, gap) {
    const where = gap.route ? ` for route "${gap.route}"` : '';
    const missing = gap.part ? `Missing grounded evidence for ${orderParts[gap.part]}${where}.`
        : gap.issue === 'order-mixed-revisions' ? `Missing same-revision proof of the two operations and their order${where}.`
            : 'Missing the citations for both operations and the code that determines their effective order.';
    return { label: 'inconclusive', reason: 'The cited evidence did not establish the required execution order.',
        missing, anchor: broker.binding.anchor, premises: [], citations: [] };
}

function receiptMetadata({ sources, ...result }) {
    delete result.matches;
    return sources ? { ...result, sources: sources.map(({ lines, ...proof }) =>
        ({ ...proof, textSha256: hash(lines.join('\n')) })) } : result;
}

function checkTree(repo, subject, allowBase) {
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

function missingOfficialEvidence(answer, actions, subject, officialPackages, requiredOfficial) {
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
    const namedAtClosing = namedOfficialPackages(officialPackages, answer.reason, ...answer.premises.map(premise => premise.claim));
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

async function investigate(source, subject, finding, cwd, transport, log, signal) {
    const started = performance.now(), writes = [], turns = [], actions = [], closures = [];
    const broker = makeBroker(source, subject, finding);
    const officialPackages = [...new Set((source.catalog ?? []).map(entry => entry.package))];
    const requiredOfficial = namedOfficialPackages(officialPackages, finding.hypothesis, path.basename(finding.detectorLocation.path));
    const first = initial(broker, subject, finding, officialPackages, requiredOfficial);
    const delivered = new Map();
    let prompt = first, threadId, observations = [], answer = null, failure = null, closureIssues = [];
    let pendingOrder;
    const checkCanceled = () => assert(!signal?.aborted, 'investigation-canceled');
    try {
        checkTree(source.repo, subject, finding.allowBase);
        while (!answer) {
            checkCanceled();
            const turn = turns.length + 1;
            log({ event: 'turn-started', finding: finding.id, turn, promptSha256: hash(prompt) });
            const result = await transport({ cwd, prompt, schema, threadId, signal });
            turns.push(result.fact);
            checkCanceled();
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
                checkTree(source.repo, subject, finding.allowBase);
                const proposed = prepareVerdict(response, broker, delivered, subject);
                closureIssues = [...proposed.omissions, ...missingOfficialEvidence(proposed.answer, actions, subject, officialPackages, requiredOfficial)];
                if (closureIssues.length) {
                    closures.push({ turn, issues: closureIssues });
                    const orderGap = closureIssues.find(gap => gap.issue.startsWith('order-'));
                    const key = JSON.stringify([actions.length, closureIssues]);
                    if (orderGap && pendingOrder === key) {
                        answer = inconclusiveOrder(broker, orderGap);
                        break;
                    }
                    pendingOrder = orderGap ? key : undefined;
                    observations = [];
                    prompt = 'The proposed verdict is still open. In this same investigation, read or recall the exact ranges ' +
                        'and submit a complete verdict. For an order issue, complete the named role with its exact code excerpt and receipt. ' +
                        'For a citation outside its receipt range, cite a delivered range if it supports the premise, ' +
                        'or request the required lines and cite the receipt returned for those lines. ' +
                        'For anchor-evidence-missing, read or recall the reported Git range on its specified revision. ' +
                        'Cite the decisive anchored line in a premise that explains how it causes the claimed effect. ' +
                        'Keep every material premise relied on by the verdict. ' +
                        'For an official-evidence issue, establish the release and request its official source. ' +
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
                checkCanceled();
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

module.exports = { investigate };
