'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { investigate } = require('./run.cjs');
const { makeBroker } = require('./broker.cjs');
const { hash } = require('../shadow-real-prs/session.cjs');
const plan = require('./plan.json');
const { ask, codexInvocation, isContextFailure, providerFailure } = require('./session.cjs');

test('records only model, provider, effort and sandbox from Codex invocation flags', () => {
    const shared = ['-c', 'model_provider="openai"', '--config', 'model_reasoning_effort="xhigh"',
        '-c', 'unused="private-value"'];
    for (const options of [
        ['--model', 'gpt-6-luna', '--sandbox', 'read-only'],
        ['-c', 'model="gpt-6-luna"', '-c', 'sandbox_mode="read-only"'],
    ]) {
        assert.deepEqual(codexInvocation(['exec', ...shared, ...options]), {
            model: 'gpt-6-luna', modelProvider: 'openai', reasoningEffort: 'xhigh', sandbox: 'read-only',
        });
    }
});

const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'bugbot-shadow-controls-'));
after(() => fs.rmSync(lab, { recursive: true, force: true }));

test('disables provider discovery and distinguishes the startup notice from an actual tool call', async () => {
    const cwd = fs.mkdtempSync(path.join(lab, 'provider-'));
    fs.writeFileSync(path.join(cwd, 'exec'), `
        const assert = require('node:assert/strict');
        const fs = require('node:fs');
        const args = process.argv.slice(2);
        for (const feature of ['code_mode_host', 'incremental_tools', 'deferred_tool_world_state', 'shell_tool']) {
            const offset = args.indexOf(feature);
            assert(offset > 0 && args[offset - 1] === '--disable');
        }
        assert(args.includes('mcp_servers={}'));
        assert.match(fs.readFileSync('instructions.txt', 'utf8'), /return action=investigate with typed requests/);
        const prompt = fs.readFileSync(0, 'utf8');
        for (const event of [
            { type: 'thread.started', thread_id: 'fixture' },
            { type: 'item.completed', item: { type: 'error', message: 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable \`features.code_mode_host\` and install \`codex-code-mode-host\`.' } },
            { type: 'turn.started' },
            ...(prompt === 'Try a provider tool.' ? [{ type: 'item.started', item: { type: 'mcp_tool_call', tool: 'list_mcp_resources' } }] : []),
            { type: 'item.completed', item: { type: 'agent_message', text: '{}' } },
            { type: 'turn.completed' },
        ]) process.stdout.write(JSON.stringify(event) + '\\n');
    `);
    const configuration = {
        provider: 'codex', modelProvider: 'openai', model: 'gpt-6-luna', effort: 'xhigh', executable: process.execPath,
    };
    const read = await ask({ cwd, prompt: 'Inspect the pinned code.', schema: {}, configuration });
    assert.equal(read.fact.failure, null);
    assert.deepEqual(read.response, {});
    const toolCall = await ask({ cwd, prompt: 'Try a provider tool.', schema: {}, configuration });
    assert.equal(toolCall.fact.failure, 'unexpected-provider-tool');
    assert.equal(toolCall.response, undefined);
});

const repo = path.join(lab, 'fixture.git');
const git = (args, input) => execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', input, env: { PATH: process.env.PATH, TMPDIR: lab, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null' },
}).trim();
fs.mkdirSync(repo);
git(['init', '--bare', '--quiet']);
const source = git(['hash-object', '-w', '--stdin'], 'export const enabled = true;\n');
const unchanged = git(['hash-object', '-w', '--stdin'], 'export const allowsRequests = false;\n' + 'x'.repeat(24_000) + '\n');
const python = git(['hash-object', '-w', '--stdin'], plan.localRuntime.python + '\n');
const lockfile = git(['hash-object', '-w', '--stdin'], "packages:\n  playwright@1.64.2:\n    resolution: {}\n");
const operations = git(['hash-object', '-w', '--stdin'], 'steps = [prepare, deliver]\nfor step in steps:\n    step()\n');
const tree = git(['mktree'], `100644 blob ${python}\t.python-version\n100644 blob ${source}\tanchor.ts\n100644 blob ${operations}\tordered.py\n100644 blob ${lockfile}\tpnpm-lock.yaml\n100644 blob ${unchanged}\tsettings.ts\n`);
const baseTree = git(['mktree'], `100644 blob ${unchanged}\tsettings.ts\n`);
const base = git(['commit-tree', baseTree, '-m', 'base']);
const head = git(['commit-tree', tree, '-p', base, '-m', 'head']);
const subject = { repository: 'local/fixture', head, tree, base, baseTree };
const finding = { id: 'same-finding', detectorLocation: { path: 'anchor.ts', line: 1, end: 1 },
    hypothesis: 'Enabling the feature allows requests.', allowBase: false };

const query = (op, target, extra = {}) => ({ op, target, revision: 'head', scope: null, first: null, last: null,
    version: null, basis: null, query: null, why: 'Determine whether the actual route is allowed.', ...extra });
const inspect = (...requests) => ({ action: 'investigate', requests, verdict: null, reason: null, missing: null, premises: [] });
const finish = (...citations) => ({ action: 'finish', requests: [], verdict: 'refuted',
    reason: 'The unchanged settings disable the reachable path.', missing: null,
    premises: citations.length ? [{ claim: 'Settings disable the reachable path.', citations, order: [] }] : [] });
const fact = usage => ({ failure: null, ...(usage === undefined ? {} : { usage, usageScope: 'session-cumulative' }) });
const payload = request => JSON.parse(request.prompt.split('\n').at(-1));
const supplied = request => payload(request).observations[0].result.sources[0];
const cite = (source, first = source.first, last = source.last) => ({ receipt: source.receipt, first, last });
const counter = value => ({ input_tokens: value, output_tokens: value, cached_input_tokens: value });
const run = (transport, log = () => {}, signal, input = subject) => investigate(lab, input, finding, null, transport, log, signal);

for (const [name, usage] of [
    ['above the old per-finding ceilings', [counter(400_000), counter(800_000), counter(1_200_000)]],
    ['without usage on any turn', [undefined, undefined, undefined]],
    ['resumed cumulative usage that would cross the old ceiling if added', [counter(99_000), counter(120_000), counter(145_000)]],
]) {
    test(`continues investigation and accepts evidence ${name}`, async () => {
        let turn = 0;
        const result = await run(async request => {
            assert.equal(request.threadId, turn === 0 ? undefined : 'same-thread');
            const call = turn++;
            const response = call === 0 ? inspect(query('read', 'anchor.ts'))
                : call === 1 ? inspect(query('read', 'settings.ts')) : finish(cite(supplied(request), 1, 1));
            return { threadId: 'same-thread', fact: fact(usage[call]), response };
        });
        assert.equal(turn, 3);
        assert.equal(result.failure, null);
        assert.equal(result.answer.label, 'refuted');
        assert.deepEqual(result.answer.anchor, finding.detectorLocation);
        assert.deepEqual(result.turns.map(turn => turn.usage), usage);
        assert.equal(result.answer.citations[0].sha, head);
        assert.equal(result.answer.citations[0].unchangedFile, true);
        assert.deepEqual(result.writes, []);
    });
}

test('delivers a full file and continues beyond the historical turn, action and retained-byte cutoffs', async () => {
    let turn = 0;
    const result = await run(async request => {
        turn++;
        if (turn === 10) {
            const source = supplied(request);
            assert.equal(source.last, 2);
            assert.equal(source.lines[1].length, 24_000);
            return { threadId: 'long', fact: fact(), response: finish(cite(source, 1, 1)) };
        }
        const requests = Array.from({ length: 6 }, () => query('read', 'settings.ts'));
        return { threadId: 'long', fact: fact(counter(1_000_000 * turn)), response: inspect(...requests) };
    });
    assert.equal(result.failure, null);
    assert.equal(result.turns.length, 10);
    assert.equal(result.actions.length, 54);
    assert.deepEqual(result.writes, []);
});

async function contextScenario({ skipRecall = false, failRecovery = false, outsideRange = false } = {}) {
    let turn = 0, anchorSource, unreceived;
    const events = [];
    const result = await run(async request => {
        turn++;
        if (turn === 1) return { threadId: 'original', fact: fact(), response: inspect(query('read', 'anchor.ts')) };
        if (turn === 2) {
            anchorSource = supplied(request);
            return { threadId: 'original', fact: fact(counter(80_000)), response: inspect(query('read', 'settings.ts')) };
        }
        if (turn === 3) {
            unreceived = supplied(request);
            return { threadId: 'original', fact: { failure: 'provider-context-window' } };
        }
        if (turn === 4) {
            assert.equal(request.threadId, undefined);
            assert.match(request.prompt, /Resume this investigation/u);
            assert.match(request.prompt, new RegExp(head, 'u'));
            const { inventory, leads } = payload(request);
            assert.deepEqual(inventory.items.map(item => item.receipt), [anchorSource.receipt, unreceived.receipt]);
            assert.deepEqual(leads[0].receipts, [unreceived.receipt]);
            assert(!request.prompt.includes('x'.repeat(100)));
            if (failRecovery) return { fact: { failure: 'provider-context-window' } };
            return { threadId: 'replacement', fact: fact(), response: skipRecall ? finish(cite(unreceived, 1, outsideRange ? 3 : 1))
                : inspect(query('recall', unreceived.receipt, { first: 1, last: 1 })) };
        }
        assert.equal(request.threadId, 'replacement');
        const recalled = supplied(request);
        assert.equal(recalled.receipt, unreceived.receipt);
        assert.deepEqual(recalled.lines, [unreceived.lines[0]]);
        return { threadId: 'replacement', fact: fact(counter(12_000)), response: finish(cite(anchorSource), cite(recalled)) };
    }, event => events.push(event));
    assert.equal(events.filter(event => event.event === 'provider-context-recovery').length, 1);
    assert.deepEqual(result.writes, []);
    return result;
}

test('recovers from an actual provider context error with pinned receipts and pending leads', async () => {
    const result = await contextScenario();
    assert.equal(result.failure, null);
    assert.equal(result.answer.citations.length, 2);
    assert.equal(result.answer.citations[1].sha, head);
});

test('rejects a receipt that was offered only in the failed provider turn', async () => {
    const result = await contextScenario({ skipRecall: true });
    assert.equal(result.failure, 'citation-not-delivered');
    assert.equal(result.answer, null);
});

test('does not offer range repair for a receipt that was never delivered', async () => {
    const result = await contextScenario({ skipRecall: true, outsideRange: true });
    assert.equal(result.failure, 'citation-not-delivered');
    assert.equal(result.answer, null);
    assert.deepEqual(result.closures, []);
});

test('reports provider failure if even a fresh checkpoint cannot be processed', async () => {
    const result = await contextScenario({ failRecovery: true });
    assert.equal(result.failure, 'provider-context-window');
    assert.equal(result.answer, null);
});

test('rejects a receipt from another operation even with missing usage', async () => {
    const prior = await run(async request => ({ threadId: 'prior', fact: fact(), response: request.threadId
        ? finish(cite(supplied(request))) : inspect(query('read', 'anchor.ts')) }));
    assert.equal(prior.failure, null);
    const result = await run(async request => ({ threadId: 'next', fact: fact(), response: request.threadId
        ? finish(cite(prior.answer.citations[0])) : inspect(query('read', 'anchor.ts')) }));
    assert.equal(result.failure, 'citation-unavailable-or-out-of-range');
    assert.equal(result.answer, null);
    assert.deepEqual(result.writes, []);
});

test('rejects a different pinned tree before dispatch', async () => {
    const result = await run(() => assert.fail('provider called'), () => {}, undefined, { ...subject, tree: baseTree });
    assert.equal(result.failure, 'pinned-head-tree-mismatch');
    assert.deepEqual(result.writes, []);
});

test('continues verification beyond the former turn and case deadlines', async t => {
    const started = performance.now();
    let clock = started, turn = 0;
    t.mock.method(performance, 'now', () => clock);
    const result = await run(async request => {
        assert(!Object.hasOwn(request, 'deadline'));
        clock += turn++ === 0 ? 60_000 : 300_000;
        return { threadId: 'unbounded-investigation', fact: fact(), response: turn === 1
            ? inspect(query('read', 'settings.ts'))
            : finish(cite(supplied(request), 1, 1)) };
    });
    assert.equal(result.failure, null);
    assert.equal(result.answer.label, 'refuted');
    assert.equal(result.wallMs, 360_000);
    assert.deepEqual(result.writes, []);
});

test('stops on real cancellation before accepting a verdict', async () => {
    const controller = new AbortController();
    const result = await run(async () => {
        controller.abort();
        return { threadId: 'closed', fact: fact(), response: finish() };
    }, () => {}, controller.signal);
    assert.equal(result.failure, 'investigation-canceled');
    assert.deepEqual(result.writes, []);
});

test('distinguishes provider context rejection from provider usage or unrelated errors', () => {
    assert(isContextFailure({ code: 'context_length_exceeded' }));
    assert(isContextFailure({ codexErrorInfo: 'contextWindowExceeded' }));
    assert(isContextFailure({ message: "Codex ran out of room in the model's context window." }));
    assert(!isContextFailure({ code: 'usageLimitExceeded', message: 'Daily account limit reached' }));
    assert(!isContextFailure({ message: 'The system cannot open a new context' }));
});

test('records a provider safety stop without trying context recovery or accepting a verdict', async () => {
    assert.equal(providerFailure({ codex_error_info: 'cy' }), 'provider-safety-stop');
    assert.equal(providerFailure({ code: 'content_filter' }), 'provider-safety-stop');
    assert.equal(providerFailure({ message: 'This content was flagged for possible cybersecurity risk.' }), 'provider-safety-stop');
    let calls = 0;
    const result = await run(async () => ({ threadId: 'same-thread', fact: calls++ === 0 ? fact() : { failure: 'provider-safety-stop' },
        response: calls === 1 ? inspect(query('read', 'settings.ts')) : undefined }));
    assert.equal(calls, 2);
    assert.equal(result.failure, 'provider-safety-stop');
    assert.equal(result.answer, null);
    assert.equal(result.actions[0].result.status, 'provided');
    assert.deepEqual(result.writes, []);
});

test('asks the same session to record an inconclusive verdict when required official evidence is unavailable', async () => {
    const requests = [query('read', 'settings.ts'), query('official', 'sqlite', { version: '0.0.0', query: 'key' })];
    let turn = 0, citation;
    const result = await run(async request => {
        let response;
        if (++turn === 1) response = inspect(...requests);
        else {
            assert.equal(request.threadId, 'official');
            if (turn === 2) {
                assert.equal(payload(request).observations[1].result.status, 'official-version-not-proven');
                citation = cite(supplied(request), 1, 1);
                response = finish(citation);
            } else {
                assert.equal(payload(request).closureIssues[0].issue, 'official-evidence-missing');
                response = { ...finish(citation), verdict: 'inconclusive', missing: 'The SQLite release and applicable official source are unproven.' };
            }
        }
        return { threadId: 'official', fact: fact(), response };
    });
    assert.equal(turn, 3);
    assert.equal(result.failure, null);
    assert.equal(result.answer.label, 'inconclusive');
    assert.match(result.answer.missing, /SQLite release/u);
    assert.deepEqual(result.writes, []);
});

test('requires official evidence for a catalogued dependency asserted at closing without a lookup', async () => {
    let turn = 0, citation;
    const result = await run(async request => {
        let response;
        if (++turn === 1) response = inspect(query('read', 'settings.ts'));
        else if (turn === 2) {
            citation = cite(supplied(request), 1, 1);
            response = { ...finish(citation), reason: "SQLite's behavior prevents the effect." };
        } else {
            assert.equal(request.threadId, 'dependency');
            assert.equal(payload(request).closureIssues[0].package, 'sqlite');
            response = { ...finish(citation), verdict: 'inconclusive', missing: 'The matching SQLite source is unavailable.' };
        }
        return { threadId: 'dependency', fact: fact(), response };
    });
    assert.equal(turn, 3);
    assert.equal(result.failure, null);
    assert.equal(result.answer.label, 'inconclusive');
    assert.deepEqual(result.writes, []);
});

test('requires the dependency named in the anchored file even when the closing draft omits its name', async () => {
    let turn = 0;
    const anchored = { ...finding, detectorLocation: { path: 'sqlite_policy.ts', line: 1, end: 1 } };
    const result = await investigate(lab, subject, anchored, null, async request => {
        let response;
        if (++turn === 1) {
            assert.deepEqual(payload(request).requiredOfficial, ['sqlite']);
            response = inspect(query('read', 'settings.ts'));
        } else if (turn === 2) {
            response = finish(cite(supplied(request), 1, 1));
        } else {
            assert.equal(request.threadId, 'anchor-dependency');
            assert.equal(payload(request).closureIssues[0].package, 'sqlite');
            response = { ...finish(), verdict: 'inconclusive', missing: 'Missing version-matched SQLite evidence.' };
        }
        return { threadId: 'anchor-dependency', fact: fact(), response };
    }, () => {});
    assert.equal(result.failure, null);
    assert.equal(result.answer.label, 'inconclusive');
    assert.equal(result.closures.length, 1);
});

test('keeps a finishing draft open while the same session recovers an omitted exact citation', async () => {
    let turn = 0, anchor, settings;
    const result = await run(async request => {
        if (turn) assert.equal(request.threadId, 'same-session');
        let response;
        switch (++turn) {
            case 1: response = inspect(query('read', 'anchor.ts'), query('read', 'settings.ts')); break;
            case 2: {
                const observations = payload(request).observations;
                anchor = cite(observations[0].result.sources[0]);
                settings = observations[1].result.sources[0];
                response = finish(anchor);
                response.premises.push({ claim: 'The early guard prevents the effect.', citations: [], order: [] });
                break;
            }
            case 3:
                assert.deepEqual(payload(request).closureIssues, [{ issue: 'uncited-premise', premise: 2 }]);
                response = inspect(query('recall', settings.receipt, { first: 1, last: 1 }));
                break;
            case 4:
                response = finish(anchor);
                response.premises.push({ claim: 'The early guard prevents the effect.', citations: [cite(supplied(request))], order: [] });
                break;
            default: assert.fail('unexpected recovery turn');
        }
        return { threadId: 'same-session', fact: fact(), response };
    });
    assert.equal(result.failure, null);
    assert.equal(turn, 4);
    assert.equal(result.answer.premises[1].citations[0].path, 'settings.ts');
    assert.equal(result.answer.premises[1].citations[0].last, 1);
    assert.equal(result.closures.length, 1);
    assert.deepEqual(result.writes, []);
});

for (const revision of ['head', 'base']) {
    test(`keeps a confirmation open until the same session cites the decisive line on ${revision}`, async () => {
        const isBase = revision === 'base';
        const anchor = isBase ? { path: 'settings.ts', line: 1, end: 1, side: 'LEFT' }
            : { path: 'ordered.py', line: 2, end: 2, side: 'RIGHT' };
        const anchored = { ...finding, detectorLocation: anchor, allowBase: isBase };
        const sha = subject[revision];
        let turn = 0, otherEvidence;
        const result = await investigate(lab, subject, anchored, null, async request => {
            assert.equal(request.threadId, turn ? 'decisive-citation' : undefined);
            let response;
            switch (++turn) {
                case 1:
                    response = inspect(query('read', anchor.path, { first: 1, last: isBase ? 1 : 3 }));
                    break;
                case 2:
                    otherEvidence = supplied(request);
                    response = { ...finish(cite(otherEvidence, 1, 1)), verdict: 'confirmed' };
                    break;
                case 3:
                    assert.deepEqual(payload(request).closureIssues, [
                        { issue: 'anchor-evidence-missing', revision, sha, path: anchor.path,
                            first: anchor.line, last: anchor.end },
                    ]);
                    response = inspect(isBase
                        ? query('read', anchor.path, { revision, first: 1, last: 1 })
                        : query('recall', otherEvidence.receipt, { first: 2, last: 2 }));
                    break;
                case 4:
                    response = { ...finish(cite(otherEvidence, 1, 1)), verdict: 'confirmed' };
                    response.premises.push({ claim: 'The anchored statement establishes the effect.',
                        citations: [cite(supplied(request))], order: [] });
                    break;
                default: assert.fail('unexpected recovery turn');
            }
            return { threadId: 'decisive-citation', fact: fact(), response };
        }, () => {});
        assert.equal(turn, 4);
        assert.equal(result.failure, null);
        assert.equal(result.answer.label, 'confirmed');
        assert.deepEqual(result.answer.anchor, anchor);
        assert.equal(result.answer.premises[1].citations[0].sha, sha);
        assert.equal(result.answer.premises[1].citations[0].first, anchor.line);
        assert.equal(result.closures.length, 1);
        assert.deepEqual(result.writes, []);
    });
}

function orderDraft(source, missingPart, neighbor = false) {
    const excerpt = (first, last, code) => ({ ...cite(source, first, last), excerpt: code });
    const order = {
        route: 'fresh initialization',
        first: [excerpt(1, 1, 'prepare')],
        second: [excerpt(neighbor ? 2 : 1, neighbor ? 2 : 1, 'deliver')],
        mechanism: [excerpt(2, 3, 'for step in steps:')],
    };
    if (missingPart) order[missingPart] = [];
    return { ...finish(), reason: 'Preparation executes before delivery on the fresh route.',
        premises: [{ claim: 'Preparation executes before delivery on the fresh route.', citations: [], order: [order] }] };
}

test('asks the same session to resubmit a one-character truncated receipt in a premise and order role', async () => {
    let turn = 0, source;
    const result = await run(async request => {
        assert.equal(request.threadId, turn ? 'receipt-repair' : undefined);
        let response;
        switch (++turn) {
            case 1:
                response = inspect(query('read', 'ordered.py'));
                break;
            case 2: {
                source = supplied(request);
                const shortened = { ...source, receipt: source.receipt.slice(0, -1) };
                response = orderDraft(source);
                response.premises[0].citations = [cite(shortened, 1, 1)];
                response.premises[0].order[0].second[0].receipt = shortened.receipt;
                break;
            }
            case 3: {
                const expected = { issue: 'citation-receipt-truncated', premise: 1, sha: head, path: 'ordered.py',
                    receipt: source.receipt.slice(0, -1), completeReceipt: source.receipt, requested: { first: 1, last: 1 } };
                assert.deepEqual(payload(request).closureIssues, [
                    expected, { ...expected, route: 'fresh initialization', part: 'second' },
                ]);
                response = orderDraft(source);
                response.premises[0].citations = [cite(source, 1, 1)];
                break;
            }
            default: assert.fail('unexpected recovery turn');
        }
        return { threadId: 'receipt-repair', fact: fact(), response };
    });
    assert.equal(turn, 3);
    assert.equal(result.failure, null);
    assert.equal(result.answer.label, 'refuted');
    assert.equal(result.answer.citations[0].receipt, source.receipt);
    assert.equal(result.closures.length, 1);
    assert.deepEqual(result.writes, []);
});

for (const [name, invalid] of [
    ['two missing characters', source => ({ ...cite(source), receipt: source.receipt.slice(0, -2) })],
    ['a different prefix', source => ({ ...cite(source),
        receipt: 'R' + (source.receipt[1] === '0' ? '1' : '0') + source.receipt.slice(2, -1) })],
    ['a range never delivered', source => ({ ...cite(source, 1, 2), receipt: source.receipt.slice(0, -1) })],
]) {
    test(`preserves the integrity rejection for a truncated receipt with ${name}`, async () => {
        const result = await run(async request => ({
            threadId: 'invalid-receipt', fact: fact(), response: request.threadId
                ? finish(invalid(supplied(request))) : inspect(query('read', 'ordered.py', { first: 1, last: 1 })),
        }));
        assert.equal(result.failure, 'citation-unavailable-or-out-of-range');
        assert.equal(result.answer, null);
        assert.deepEqual(result.closures, []);
        assert.deepEqual(result.writes, []);
    });
}

for (const order of [false, true]) {
    test(`repairs a delivered receipt's out-of-range ${order ? 'order' : 'premise'} citation in the same session`, async () => {
        let turn = 0, original;
        const result = await run(async request => {
            assert.equal(request.threadId, turn ? 'citation-repair' : undefined);
            let response;
            switch (++turn) {
                case 1: response = inspect(query('read', 'ordered.py', { first: 2, last: 3 })); break;
                case 2:
                    original = supplied(request);
                    response = order ? orderDraft(original) : finish(cite(original, 1, 2));
                    break;
                case 3: {
                    const gaps = payload(request).closureIssues;
                    assert.equal(gaps.length, order ? 2 : 1);
                    assert.deepEqual(gaps[0], {
                        issue: 'citation-outside-receipt-range', premise: 1,
                        ...(order && { route: 'fresh initialization', part: 'first' }),
                        receipt: original.receipt, sha: head, path: 'ordered.py',
                        requested: { first: 1, last: order ? 1 : 2 }, delivered: [{ first: 2, last: 3 }],
                    });
                    response = inspect(query('read', 'ordered.py', { first: 1, last: 3 }));
                    break;
                }
                case 4: {
                    const repaired = supplied(request);
                    assert.notEqual(repaired.receipt, original.receipt);
                    response = order ? orderDraft(repaired) : finish(cite(repaired, 1, 2));
                    break;
                }
                default: assert.fail('unexpected recovery turn');
            }
            return { threadId: 'citation-repair', fact: fact(), response };
        });
        assert.equal(turn, 4);
        assert.equal(result.failure, null);
        assert.equal(result.answer.label, 'refuted');
        assert.equal(result.answer.citations[0].first, 1);
        assert.deepEqual(result.answer.anchor, finding.detectorLocation);
        assert.equal(result.closures.length, 1);
        assert.deepEqual(result.writes, []);
    });
}

for (const [part, neighbor] of [['second', false], ['mechanism', false], ['second', true]]) {
    test(`keeps the same session open for the ${part} ${neighbor ? 'excerpt outside its cited range' : 'order evidence'}`, async () => {
        let turn = 0, source;
        const result = await run(async request => {
            if (turn) assert.equal(request.threadId, 'ordered');
            let response;
            switch (++turn) {
                case 1: response = inspect(query('read', 'ordered.py')); break;
                case 2:
                    source = supplied(request);
                    response = orderDraft(source, neighbor ? null : part, neighbor);
                    break;
                case 3:
                    assert.deepEqual(payload(request).closureIssues, [{
                        issue: neighbor ? 'order-excerpt-unsupported' : 'order-evidence-missing',
                        premise: 1, route: 'fresh initialization', part,
                    }]);
                    response = inspect(query('recall', source.receipt, { first: 1, last: 3 }));
                    break;
                case 4: response = orderDraft(supplied(request)); break;
                default: assert.fail('unexpected recovery turn');
            }
            return { threadId: 'ordered', fact: fact(), response };
        });
        assert.equal(result.failure, null);
        assert.equal(result.answer.label, 'refuted');
        assert.deepEqual(result.writes, []);
        assert.equal(result.answer.premises[0].order[0].second[0].citation.first, 1);
        assert.equal(result.answer.premises[0].order[0].mechanism[0].citation.last, 3);
        assert.equal(result.closures.length, 1);
    });
}

test('leaves a repeated order gap inconclusive with the specific missing role', async () => {
    let turn = 0, source;
    const result = await run(async request => {
        let response;
        if (++turn === 1) response = inspect(query('read', 'ordered.py'));
        else {
            if (turn === 2) source = supplied(request);
            response = orderDraft(source, 'mechanism');
        }
        return { threadId: 'same-gap', fact: fact(), response };
    });
    assert.equal(turn, 3);
    assert.equal(result.failure, null);
    assert.equal(result.answer.label, 'inconclusive');
    assert.match(result.answer.missing, /code that determines the effective order.*fresh initialization/u);
    assert.deepEqual(result.writes, []);
});

test('requests order roles for an explicit sequence supported only by ordinary citations', async () => {
    let turn = 0;
    const result = await run(async request => {
        let response;
        if (++turn === 1) response = inspect(query('read', 'ordered.py'));
        else if (turn === 2) {
            response = finish(cite(supplied(request)));
            response.premises[0].claim = 'Preparation executes before delivery.';
        } else {
            assert.deepEqual(payload(request).closureIssues, [{ issue: 'order-claim-uncited', premise: 1 }]);
            response = { ...finish(), verdict: 'inconclusive', missing: 'The execution loop is unavailable.' };
        }
        return { threadId: 'implicit-order', fact: fact(), response };
    });
    assert.equal(result.answer.label, 'inconclusive');
});

test('identifies the incomplete route and accepts a verdict narrowed to the proven route', async () => {
    let turn = 0, source;
    const result = await run(async request => {
        let response;
        if (++turn === 1) response = inspect(query('read', 'ordered.py'));
        else if (turn === 2) {
            source = supplied(request);
            response = orderDraft(source);
            response.premises[0].order.push({
                ...response.premises[0].order[0], route: 'upgrade', mechanism: [],
            });
        } else {
            assert.equal(request.threadId, 'narrow-route');
            assert.deepEqual(payload(request).closureIssues, [{
                issue: 'order-evidence-missing', premise: 1, route: 'upgrade', part: 'mechanism',
            }]);
            response = orderDraft(source);
        }
        return { threadId: 'narrow-route', fact: fact(), response };
    });
    assert.equal(result.failure, null);
    assert.equal(result.answer.label, 'refuted');
    assert.deepEqual(result.answer.premises[0].order.map(route => route.route), ['fresh initialization']);
});

test('rejects a foreign receipt in an order role as an integrity failure', async () => {
    const result = await run(async request => {
        if (!request.threadId) return { threadId: 'foreign-order', fact: fact(), response: inspect(query('read', 'ordered.py')) };
        const response = orderDraft(supplied(request));
        response.premises[0].order[0].second[0].receipt = 'R-foreign-receipt';
        return { threadId: 'foreign-order', fact: fact(), response };
    });
    assert.equal(result.failure, 'citation-unavailable-or-out-of-range');
    assert.equal(result.answer, null);
    assert.deepEqual(result.writes, []);
});

function runtimeEvidence(catalog) {
    const broker = makeBroker(lab, subject, { ...finding, allowBase: true }, catalog);
    const delivered = new Map();
    const remember = proof => delivered.set(proof.receipt, [{ first: proof.first, last: proof.last }]);
    const pin = broker.inspect(query('read', '.python-version')).sources[0];
    remember(pin);
    const runtime = broker.inspect(query('runtime', 'sqlite', { basis: pin.receipt }), delivered).sources[0];
    return { broker, delivered, pin, runtime, remember };
}

test('derives a typed, local-only SQLite release from a delivered runtime receipt', () => {
    const { broker, delivered, runtime, remember } = runtimeEvidence();
    const lookup = query('official', 'sqlite', { basis: runtime.receipt, query: 'UNIQUE index' });
    assert.equal(broker.inspect(lookup, delivered).status, 'official-version-not-proven');
    const wrongBasis = broker.inspect(query('runtime', 'sqlite', { basis: runtime.receipt }), delivered);
    assert.deepEqual(wrongBasis, { status: 'runtime-basis',
        requiredBasis: { kind: 'git', path: '.python-version', revision: 'head' } });
    remember(runtime);
    assert.equal(runtime.version, plan.localRuntime.sqlite);
    assert.match(runtime.versionScope, /historical hosted linked SQLite version unmeasured/u);
    assert.deepEqual(broker.inspect(lookup, delivered), { status: 'official-source-unavailable', package: 'sqlite',
        version: plan.localRuntime.sqlite, versionScope: plan.localRuntime.scope });
});

test('delivers version-scoped official source and distinguishes no text match from missing source', () => {
    const contents = 'Match the UNIQUE index.\n';
    const file = 'synthetic-official.c';
    fs.writeFileSync(path.join(lab, file), contents);
    const { broker, delivered, runtime, remember } = runtimeEvidence([{ package: 'sqlite',
        version: plan.localRuntime.sqlite, kind: 'release-source', file, sha256: hash(contents),
        url: 'https://example.invalid/source', commit: 'f'.repeat(40) }]);
    remember(runtime);
    const lookup = query('official', 'sqlite', { basis: runtime.receipt, query: 'UNIQUE index' });
    const source = broker.inspect(lookup, delivered).sources[0];
    assert.equal(source.sha, head);
    assert.equal(source.version, runtime.version);
    assert.equal(source.versionScope, runtime.versionScope);
    assert.equal(source.basis, runtime.receipt);
    assert.equal(broker.cite(cite(source)).textSha256, hash(contents.trimEnd()));
    assert.equal(broker.inspect({ ...lookup, query: 'different text' }, delivered).status, 'official-no-match');
});

test('rejects incompatible official basis receipts and explicit versions', () => {
    const { broker, delivered, pin, runtime, remember } = runtimeEvidence();
    remember(runtime);
    const lock = broker.inspect(query('read', 'pnpm-lock.yaml')).sources[0];
    remember(lock);
    const lockLookup = query('official', 'playwright', { basis: lock.receipt, version: '1.64.2', query: 'key' });
    assert.equal(broker.inspect(lockLookup, delivered).status, 'official-source-unavailable');
    assert.equal(broker.inspect({ ...lockLookup, version: '1.64.1' }, delivered).status, 'official-version-not-proven');
    const foreign = runtimeEvidence();
    foreign.remember(foreign.runtime);
    const lookup = query('official', 'sqlite', { basis: runtime.receipt, query: 'UNIQUE index' });
    for (const request of [{ ...lookup, basis: pin.receipt }, { ...lookup, target: 'playwright' },
        { ...lookup, version: '3.53' }, { ...lookup, revision: 'base' },
        { ...lookup, basis: foreign.runtime.receipt }]) {
        assert.equal(broker.inspect(request, delivered).status, 'official-version-not-proven');
    }
});

test('verifies with the inherited configuration and classifies changed files against the actual base', async () => {
    const { createShadowVerifier } = require('./adapter.cjs');
    const configuration = { provider: 'codex', modelProvider: 'openai', model: 'another-compatible-model', effort: 'low' };
    const candidate = { id: finding.id, hypothesis: finding.hypothesis, anchor: finding.detectorLocation,
        repository: { owner: 'local', name: 'fixture' }, pullRequest: 24, headSha: head, baseSha: base, allowBase: false };
    const log = [];
    let turn = 0;
    const adapter = createShadowVerifier(lab, event => log.push(event), async request => {
        assert.equal(request.configuration, configuration);
        if (++turn === 1) {
            assert.equal(request.threadId, undefined);
            assert.equal(payload(request).base, null);
            return { threadId: 'adapter', fact: fact(), response: inspect(
                query('read', 'anchor.ts'),
                query('read', 'settings.ts', { revision: 'base' }),
            ) };
        }
        assert.equal(request.threadId, 'adapter');
        assert.equal(payload(request).observations[1].result.status, 'base-denied');
        return { threadId: 'adapter', fact: { ...fact(), reportedModel: configuration.model },
            response: finish(cite(supplied(request))) };
    });
    const result = await adapter.verify({ candidate, configuration });
    assert.equal(result.status, 'verdict');
    assert.equal(result.reportedModel, configuration.model);
    assert.equal(result.citations[0].inChangedLines, true);
    assert.equal(result.citations[0].unchangedFile, false);
    assert.deepEqual(log.find(event => event.event === 'finding-result').writes, []);
});

const lifecycleRun = require('../../../../../src/infrastructure/bugbot/shadow/run.cjs').investigate;
const { fixtureSource } = require('./source.cjs');
const lifecycleResponse = (response, dependencies = []) => ({ ...response, dependencies });
const fixtureDependency = { package: 'sqlite', revision: 'head', premise: 1 };

function simulateLifecycle(respond, options = {}) {
    let turn = 0;
    return lifecycleRun(options.source ?? fixtureSource(lab, subject), subject, options.finding ?? finding, null,
        async request => ({ threadId: 'lifecycle', fact: fact(), response: await respond(request, ++turn) }),
        () => {}, undefined, { lifecycle: true, sharedRead: options.sharedRead });
}

test('lifecycle uses one alias across read and recall and records only canonical citations', async () => {
    let alias;
    const result = await simulateLifecycle((request, turn) => {
        if (turn === 1) {
            assert.match(request.prompt, /Use the short evidence reference/u);
            assert(request.schema.properties.dependencies);
            return lifecycleResponse(inspect(query('read', 'settings.ts')));
        }
        if (turn === 2) {
            alias = supplied(request).receipt;
            assert.match(alias, /^E[a-f0-9]{10}-1$/u);
            return lifecycleResponse(inspect(query('recall', alias, { first: 1, last: 1 })));
        }
        assert.equal(supplied(request).receipt, alias);
        return lifecycleResponse(finish(cite(supplied(request))));
    });
    assert.equal(result.answer.label, 'refuted');
    assert.match(result.answer.citations[0].receipt, /^R[a-f0-9]{24}$/u);
    assert.equal(result.actions[1].result.sources[0].alias, alias);
    assert.equal(result.actions[1].result.sources[0].receipt, result.answer.citations[0].receipt);
    assert(result.actions.every(action => action.delivered));
    assert.equal(result.turnDurationsMs.length, 3);
});

test('lifecycle refuses an alias from another candidate even when the source range is identical', async () => {
    let foreignAlias;
    await simulateLifecycle((request, turn) => {
        if (turn === 1) return lifecycleResponse(inspect(query('read', 'settings.ts')));
        foreignAlias = supplied(request).receipt;
        return lifecycleResponse(finish(cite(supplied(request), 1, 1)));
    });
    const result = await simulateLifecycle((request, turn) => {
        if (turn === 1) return lifecycleResponse(inspect(query('read', 'settings.ts')));
        assert.notEqual(supplied(request).receipt, foreignAlias);
        return lifecycleResponse(finish({ receipt: foreignAlias, first: 1, last: 1 }));
    }, { finding: { ...finding, id: 'another' } });
    assert.equal(result.failure, 'citation-unavailable-or-out-of-range');
    assert.equal(result.answer, null);
});

test('lifecycle repairs an exact range using a short alias in the same session', async () => {
    let alias;
    const result = await simulateLifecycle((request, turn) => {
        if (turn === 1) return lifecycleResponse(inspect(query('read', 'ordered.py', { first: 1, last: 1 })));
        assert.equal(request.threadId, 'lifecycle');
        if (turn === 2) {
            alias = supplied(request).receipt;
            return lifecycleResponse(finish({ receipt: alias, first: 1, last: 2 }));
        }
        if (turn === 3) {
            assert.equal(payload(request).closureIssues[0].receipt, alias);
            return lifecycleResponse(inspect(query('read', 'ordered.py', { first: 1, last: 2 })));
        }
        return lifecycleResponse(finish(cite(supplied(request))));
    });
    assert.equal(result.answer.label, 'refuted');
    assert.equal(result.closures[0].issues[0].issue, 'citation-outside-receipt-range');
    assert.equal(result.answer.citations[0].last, 2);
});

test('lifecycle allows a local-code verdict after an incidental official lookup fails', async () => {
    const result = await simulateLifecycle((request, turn) => {
        if (turn === 1) {
            assert.deepEqual(payload(request).requiredOfficial, []);
            return lifecycleResponse(inspect(query('read', 'settings.ts'), query('official', 'sqlite', { query: 'key' })));
        }
        assert.equal(payload(request).observations[1].result.status, 'official-version-not-proven');
        return lifecycleResponse({ ...finish(cite(supplied(request), 1, 1)), reason: 'The repository settings disable the SQLite feature.' });
    }, { finding: { ...finding, detectorLocation: { path: 'sqlite_feature.ts', line: 1, end: 1 } } });
    assert.equal(result.answer.label, 'refuted');
    assert.deepEqual(result.closures, []);
});

test('lifecycle requires official evidence for an explicit material premise and names an unchanged gap', async () => {
    let citation;
    const result = await simulateLifecycle((request, turn) => {
        if (turn === 1) return lifecycleResponse(inspect(query('read', 'settings.ts')));
        if (turn === 2) citation = cite(supplied(request), 1, 1);
        else assert.deepEqual(payload(request).closureIssues,
            [{ issue: 'official-evidence-missing', package: 'sqlite', sha: head, premise: 1 }]);
        return lifecycleResponse(finish(citation), [fixtureDependency]);
    });
    assert.equal(result.answer.label, 'inconclusive');
    assert.match(result.answer.missing, /sqlite/u);
    assert.equal(result.turns.length, 3);
});

test('lifecycle independently requires a dependency named in the hypothesis', async () => {
    const result = await simulateLifecycle((request, turn) => {
        if (turn === 1) {
            assert.deepEqual(payload(request).requiredOfficial, ['sqlite']);
            return lifecycleResponse(inspect(query('read', 'settings.ts')));
        }
        if (turn === 2) return lifecycleResponse(finish(cite(supplied(request), 1, 1)));
        assert.equal(payload(request).closureIssues[0].package, 'sqlite');
        return lifecycleResponse({ ...finish(), verdict: 'inconclusive', missing: 'The official version is unavailable.' });
    }, { finding: { ...finding, hypothesis: 'SQLite requires the missing constraint.' } });
    assert.equal(result.answer.label, 'inconclusive');
});

test('lifecycle uses a delivered alias as an authenticated runtime and official basis', async () => {
    const file = 'lifecycle-official.c';
    const content = 'A UNIQUE index can implement a candidate parent key.\n';
    fs.writeFileSync(path.join(lab, file), content);
    const source = fixtureSource(lab, subject, [{ package: 'sqlite', version: plan.localRuntime.sqlite, kind: 'source', file,
        commit: '9'.repeat(40), url: 'https://sqlite.org/src/file/src/fkey.c', sha256: hash(content) }]);
    const result = await simulateLifecycle((request, turn) => {
        if (turn === 1) return lifecycleResponse(inspect(query('read', '.python-version')));
        if (turn === 2) return lifecycleResponse(inspect(query('runtime', 'sqlite', { basis: supplied(request).receipt })));
        if (turn === 3) return lifecycleResponse(inspect(query('official', 'sqlite', { basis: supplied(request).receipt, query: 'UNIQUE index' })));
        assert.equal(supplied(request).kind, 'official');
        assert.equal(supplied(request).versionScope, plan.localRuntime.scope);
        return lifecycleResponse(finish(cite(supplied(request))), [fixtureDependency]);
    }, { source });
    assert.equal(result.answer.label, 'refuted');
    assert.equal(result.answer.citations[0].version, plan.localRuntime.sqlite);
    assert.match(result.answer.citations[0].basis, /^R/u);
});

test('a trusted dependency version requires the exact pinned blob, revision and delivered range', () => {
    const item = { package: 'sample-tool', version: '1.2.3', sha: head, blob: lockfile,
        path: 'pnpm-lock.yaml', first: 2, last: 3, scope: 'pinned lockfile resolution' };
    const source = fixtureSource(lab, subject, []);
    for (const [version, last, expected] of [
        [item, 3, 'official-source-unavailable'],
        [item, 2, 'official-version-not-proven'],
        [{ ...item, sha: base }, 3, 'official-version-not-proven'],
        [{ ...item, blob: operations }, 3, 'official-version-not-proven'],
    ]) {
        const broker = require('../../../../../src/infrastructure/bugbot/shadow/broker.cjs')
            .makeBroker({ ...source, resolvedVersions: [version] }, subject, finding);
        const { receipt } = broker.inspect(query('read', 'pnpm-lock.yaml', { first: 2, last })).sources[0];
        const delivered = new Map([[receipt, [{ first: 2, last }]]]);
        const lookup = query('official', item.package, { query: 'setting', basis: receipt });
        assert.equal(broker.inspect(lookup, delivered).status, expected);
        assert.equal(broker.inspect({ ...lookup, version: '2.0.0' }, delivered).status, 'official-version-not-proven');
    }
});

test('a context restart keeps aliases and authenticates only ranges actually delivered', async () => {
    let turn = 0, alias, pending;
    const runtime = fixtureSource(lab, subject);
    const result = await lifecycleRun(runtime, subject, finding, null, async request => {
        turn++;
        if (turn === 1) return { threadId: 'before', fact: fact(), response: lifecycleResponse(inspect(query('read', 'anchor.ts'))) };
        if (turn === 2) {
            alias = supplied(request).receipt;
            return { threadId: 'before', fact: fact(counter(400_000)), response: lifecycleResponse(inspect(query('read', 'settings.ts'))) };
        }
        if (turn === 3) {
            pending = supplied(request).receipt;
            return { threadId: 'before', fact: { failure: 'provider-context-window' } };
        }
        if (turn === 4) {
            assert.equal(request.threadId, undefined);
            assert.deepEqual(payload(request).inventory.items.map(item => item.receipt), [alias, pending]);
            return { threadId: 'after', fact: fact(), response: lifecycleResponse(inspect(query('recall', pending, { first: 1, last: 1 }))) };
        }
        assert.equal(request.threadId, 'after');
        assert.equal(supplied(request).receipt, pending);
        return { threadId: 'after', fact: fact(), response: lifecycleResponse(finish(cite(supplied(request)))) };
    }, () => {}, undefined, { lifecycle: true });
    assert.equal(result.contextRestarts, 1);
    assert.deepEqual(result.actions.map(action => action.delivered), [true, false, true]);
    assert.equal(result.answer.label, 'refuted');
    assert.deepEqual(result.writes, []);
});

test('rejects a dependency attached to an invalid premise or an unauthorized revision', async () => {
    for (const [dependency, expected] of [
        [{ ...fixtureDependency, premise: 2 }, 'invalid-material-dependency-premise'],
        [{ ...fixtureDependency, revision: 'base' }, 'material-dependency-base-denied'],
        [{ ...fixtureDependency, package: '../untrusted' }, 'invalid-material-dependency'],
    ]) {
        const result = await simulateLifecycle((request, turn) => turn === 1
            ? lifecycleResponse(inspect(query('read', 'settings.ts')))
            : lifecycleResponse(finish(cite(supplied(request), 1, 1)), [dependency]));
        assert.equal(result.failure, expected);
        assert.equal(result.answer, null);
    }
});

test('receipt inventory exposes only session aliases and preserves canonical delivery tracking', async () => {
    let receipt;
    const result = await simulateLifecycle((request, turn) => {
        if (turn === 1) return lifecycleResponse(inspect(query('read', 'settings.ts')));
        if (turn === 2) {
            receipt = supplied(request).receipt;
            return lifecycleResponse(inspect(query('receipts', 'receipts')));
        }
        const [item] = payload(request).observations[0].result.items;
        assert.equal(item.receipt, receipt);
        assert.equal(Object.hasOwn(item, 'lines'), false);
        return lifecycleResponse(finish(cite(item, 1, 1)));
    });
    assert.equal(result.answer.label, 'refuted');
    assert.equal(result.actions[1].result.status, 'inventory');
});

test('a verified official citation must support the exact declared premise and revision', () => {
    const { missingMaterialOfficialEvidence, officialPackage } = require('../../../../../src/application/policies/bugbot_material_dependency_policy.cjs');
    const citation = { kind: 'official', package: 'playwright', sha: head };
    const declarations = [{ package: '@playwright/test', revision: 'head', premise: 2 }];
    const given = { dependencies: declarations, required: ['playwright'], head, base, allowBase: true, normalize: officialPackage };
    const answer = { label: 'refuted', premises: [{ citations: [citation] }, { citations: [] }], citations: [citation] };
    assert.equal(missingMaterialOfficialEvidence({ ...given, answer })[0].premise, 2);
    assert.deepEqual(missingMaterialOfficialEvidence({ ...given,
        answer: { ...answer, premises: [{ citations: [] }, { citations: [citation] }] } }), []);
    assert.equal(missingMaterialOfficialEvidence({ ...given, dependencies: [{ ...declarations[0], revision: 'base' }], answer })[0].sha, base);
    assert.throws(() => missingMaterialOfficialEvidence({ ...given, answer, dependencies: [...declarations, ...declarations] }),
        /duplicate-material-dependency/u);
});

test('evidence cache eviction never blocks an authorized read or truncates the returned source', () => {
    const { createSourceCache } = require('../../../../../src/infrastructure/bugbot/shadow/source_cache.cjs');
    const cache = createSourceCache();
    const hits = [];
    const read = (key, value) => cache(key, () => value, () => hits.push(key));
    for (let key = 0; key < 128; key++) assert.equal(read(String(key), key), key);
    assert.equal(read('0', 'would be a cache miss'), 0);
    read('new', 'new value');
    assert.equal(read('1', 'evicted'), 'evicted');
    const largeSource = 'x'.repeat(16 * 1024 * 1024 + 1);
    assert.equal(read('large', largeSource), largeSource);
    assert.equal(read('large', 'read again after skipping retention'), 'read again after skipping retention');
    assert.deepEqual(hits, ['0']);
});
