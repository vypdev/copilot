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
const { isContextFailure } = require('./session.cjs');

const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'bugbot-shadow-controls-'));
after(() => fs.rmSync(lab, { recursive: true, force: true }));
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
const tree = git(['mktree'], `100644 blob ${python}\t.python-version\n100644 blob ${source}\tanchor.ts\n100644 blob ${lockfile}\tpnpm-lock.yaml\n100644 blob ${unchanged}\tsettings.ts\n`);
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
    premises: citations.length ? [{ claim: 'Settings disable the reachable path.', citations }] : [] });
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

async function contextScenario({ skipRecall = false, failRecovery = false } = {}) {
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
            return { threadId: 'replacement', fact: fact(), response: skipRecall ? finish(cite(unreceived, 1, 1))
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
                response.premises.push({ claim: 'The early guard prevents the effect.', citations: [] });
                break;
            }
            case 3:
                assert.deepEqual(payload(request).closureIssues, [{ issue: 'uncited-premise', premise: 2 }]);
                response = inspect(query('recall', settings.receipt, { first: 1, last: 1 }));
                break;
            case 4:
                response = finish(anchor);
                response.premises.push({ claim: 'The early guard prevents the effect.', citations: [cite(supplied(request))] });
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
