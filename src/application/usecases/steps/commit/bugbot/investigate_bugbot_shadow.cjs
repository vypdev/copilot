'use strict';

const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { CitationRangeError, createEvidenceReferences } = require('../../../../policies/bugbot_evidence_reference_policy.cjs');
const { catalogPackagesInClaim, missingMaterialOfficialEvidence, officialPackage } = require('../../../../policies/bugbot_material_dependency_policy.cjs');

const text = (value, limit) => typeof value === 'string' && value.trim() && Buffer.byteLength(value) <= limit;

function initial(broker, subject, finding, officialPackages, requiredOfficial, instructions) {
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

function deliveredReceiptHint({ receipt, first, last }, delivered) {
    if (!/^R[a-f0-9]+$/u.test(receipt)) return undefined;
    const matches = [...delivered.keys()].filter(id => id.length === receipt.length + 1 && id.startsWith(receipt));
    if (matches.length !== 1) return undefined;
    const [match] = matches;
    return delivered.get(match).some(range => range.first <= first && first <= last && last <= range.last)
        ? match : undefined;
}

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
                    || !broker.containsExcerpt({ ...citation, receipt: source.receipt }, excerpt.trim())) {
                    omissions.push({ issue: 'order-excerpt-unsupported', premise, route, part });
                }
                return [{ excerpt, citation: source }];
            });
        }
        if (shas.size > 1) omissions.push({ issue: 'order-mixed-revisions', premise, route });
        return proof;
    });
}

function prepareVerdict(response, broker, delivered, subject, references) {
    assert.equal(response.requests.length, 0, 'final-has-requests');
    assert(response.verdict && text(response.reason, 3000), 'final-verdict-or-reason');
    if (response.verdict === 'inconclusive') assert(text(response.missing, 1000), 'final-missing-condition');
    else assert(response.missing === null, 'final-missing-condition');

    const omissions = [];
    const proofs = new Map();
    function validateCitation(citation, location) {
        const { first, last } = citation;
        const receipt = references?.resolve(citation.receipt) ?? citation.receipt;
        citation = { ...citation, receipt };
        const key = JSON.stringify([receipt, first, last]);
        if (!proofs.has(key)) {
            const ranges = delivered.get(receipt);
            const completeReceipt = ranges ? undefined : deliveredReceiptHint(citation, delivered);
            if (completeReceipt) {
                const { sha, path, url } = broker.cite({ ...citation, receipt: completeReceipt });
                omissions.push({ issue: 'citation-receipt-truncated', ...location, sha, path, url,
                    receipt, completeReceipt, requested: { first, last } });
                return null;
            }
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

function receiptMetadata({ sources, ...result }, references, fingerprint) {
    delete result.matches;
    return sources ? { ...result, sources: sources.map(({ lines, ...proof }) =>
        ({ ...proof, ...(references ? { alias: references.present(proof.receipt) } : {}), textSha256: fingerprint(lines.join('\n')) })) } : result;
}


function recordDelivery(delivered, observations) {
    for (const { result, ledger } of observations) {
        if (ledger && 'delivered' in ledger) ledger.delivered = true;
        for (const { receipt, first, last } of result.sources ?? []) {
            const ranges = delivered.get(receipt) ?? [];
            if (!ranges.some(range => range.first === first && range.last === last)) ranges.push({ first, last });
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
    const namedAtClosing = catalogPackagesInClaim(officialPackages, [answer.reason, ...answer.premises.map(premise => premise.claim)].join(' '));
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

/** One independent investigation over evidence and provider ports. */
async function investigateBugbotShadow({ broker, subject, finding, transport, log, signal, lifecycle,
    officialPackages, instructions, schema, validate, checkRevision, fingerprint }) {
    const started = performance.now(), writes = [], turns = [], actions = [], closures = [];
    const references = lifecycle ? createEvidenceReferences(broker.binding.operation) : undefined;
    const turnDurationsMs = [];
    let contextRestarts = 0;
    const requiredOfficial = catalogPackagesInClaim(officialPackages, lifecycle ? finding.hypothesis : finding.hypothesis + ' ' + path.basename(finding.detectorLocation.path));
    const first = initial(broker, subject, finding, officialPackages, requiredOfficial, instructions);
    const delivered = new Map();
    let prompt = first, threadId, observations = [], answer = null, failure = null, closureIssues = [];
    let pendingClosure;
    const present = receipt => references?.present(receipt) ?? receipt;
    const visibleIssues = () => closureIssues.map(issue => ({ ...issue,
        ...(issue.receipt && { receipt: present(issue.receipt) }),
        ...(issue.completeReceipt && { completeReceipt: present(issue.completeReceipt) }),
    }));
    const inventory = () => {
        const result = broker.inventory();
        return references?.inventory(result) ?? result;
    };
    const checkCanceled = () => assert(!signal?.aborted, 'investigation-canceled');
    try {
        checkRevision();
        while (!answer) {
            checkCanceled();
            const turn = turns.length + 1;
            log({ event: 'turn-started', finding: finding.id, turn, promptSha256: fingerprint(prompt) });
            const turnStarted = performance.now();
            const result = await Promise.resolve().then(() => transport({ prompt, schema, threadId, signal }))
                .finally(() => turnDurationsMs.push(Math.round(performance.now() - turnStarted)));
            turns.push(result.fact);
            checkCanceled();
            if (result.threadId) assert(!threadId || result.threadId === threadId, 'thread-mismatch');
            if (result.fact.failure === 'provider-context-window' && threadId) {
                // A provider rejection may leave the latest source undelivered.
                // Keep its receipt available for recall, alongside earlier delivered sources.
                contextRestarts++;
                log({ event: 'provider-context-recovery', finding: finding.id, turn });
                const leads = observations.map(({ request, result }) => ({
                    op: request.op, target: request.target, why: request.why, status: result.status,
                    receipts: (result.sources ?? []).map(source => present(source.receipt)),
                }));
                prompt = first + '\nThe provider context window filled. Resume this investigation with the same evidence identity. ' +
                    'Retrieve saved code with recall, paginate receipts for older evidence, and request narrower ranges when needed.\n' +
                    JSON.stringify({ inventory: inventory(), leads, closureIssues: visibleIssues() });
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
                checkRevision();
                const proposed = prepareVerdict(response, broker, delivered, subject, references);
                const officialGaps = lifecycle
                    ? missingMaterialOfficialEvidence({ answer: proposed.answer, dependencies: response.dependencies,
                        required: requiredOfficial, head: subject.head, base: subject.base,
                        allowBase: finding.allowBase, normalize: officialPackage })
                    : missingOfficialEvidence(proposed.answer, actions, subject, officialPackages, requiredOfficial);
                closureIssues = [...proposed.omissions, ...officialGaps];
                if (closureIssues.length) {
                    closures.push({ turn, issues: closureIssues });
                    const orderGap = closureIssues.find(gap => gap.issue.startsWith('order-'));
                    const key = JSON.stringify([actions.length, closureIssues]);
                    if (pendingClosure === key && (lifecycle || orderGap)) {
                        const gap = closureIssues[0];
                        answer = orderGap ? inconclusiveOrder(broker, orderGap) : {
                            label: 'inconclusive', reason: 'The investigation did not supply the required evidence.',
                            missing: gap.package ? `Missing version-matched official evidence for ${gap.package} at ${gap.sha}.`
                                : `Missing exact evidence for ${gap.issue} in premise ${gap.premise ?? 'or anchor of the finding'}.`,
                            anchor: broker.binding.anchor, premises: [], citations: [],
                        };
                        break;
                    }
                    pendingClosure = key;
                    observations = [];
                    prompt = 'The proposed verdict is still open. In this same investigation, read or recall the exact ranges ' +
                        'and submit a complete verdict. For an order issue, complete the named role with its exact code excerpt and receipt. ' +
                        'For a citation outside its receipt range, cite a delivered range if it supports the premise, ' +
                        'or request the required lines and cite the receipt returned for those lines. ' +
                        'For citation-receipt-truncated, resubmit the citation with the exact completeReceipt. ' +
                        'For anchor-evidence-missing, read or recall the reported Git range on its specified revision. ' +
                        'Cite the decisive anchored line in a premise that explains how it causes the claimed effect. ' +
                        'Keep every material premise relied on by the verdict. ' +
                        'For an official-evidence issue, establish the release and request its official source. ' +
                        'If material evidence is unavailable, finish inconclusive and state the specific gap.\n' +
                        JSON.stringify({ closureIssues: visibleIssues() });
                    continue;
                }
                answer = proposed.answer;
                break;
            }
            assert(response.verdict === null && response.reason === null && response.missing === null
                && !response.premises.length && !response.dependencies?.length && response.requests.length > 0, 'investigation-shape');
            observations = [];
            for (const request of response.requests) {
                checkCanceled();
                const result = broker.inspect(references?.request(request) ?? request, delivered);
                const ledger = { turn, request, result: receiptMetadata(result, references, fingerprint), ...(lifecycle ? { delivered: false } : {}) };
                observations.push({ request, result, ledger });
                actions.push(ledger);
            }
            prompt = 'The broker returned untrusted observations. Continue investigating or finish with a supported verdict.\n' +
                JSON.stringify({ observations: observations.map(({ request, result }) =>
                    ({ request, result: references?.observation(result) ?? result })) });
        }
    } catch (error) {
        failure = /^[a-z][a-z0-9-]+$/u.test(error.message) ? error.message : 'integrity-or-runner-error';
    }
    return { event: 'finding-result', ...broker.binding, initialPromptSha256: fingerprint(first),
        status: failure ? 'failed' : 'completed', answer, failure, turns, actions, closures,
        wallMs: Math.round(performance.now() - started), writes,
        ...(lifecycle ? { turnDurationsMs, contextRestarts } : {}) };
}

module.exports = { investigateBugbotShadow };
