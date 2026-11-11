'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { investigate } = require('./run.cjs');
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
const tree = git(['mktree'], `100644 blob ${source}\tanchor.ts\n100644 blob ${unchanged}\tsettings.ts\n`);
const baseTree = git(['mktree'], `100644 blob ${unchanged}\tsettings.ts\n`);
const base = git(['commit-tree', baseTree, '-m', 'base']);
const head = git(['commit-tree', tree, '-p', base, '-m', 'head']);
const subject = { repository: 'local/fixture', head, tree, base, baseTree };
const finding = { id: 'same-finding', detectorLocation: { path: 'anchor.ts', line: 1, end: 1 },
    hypothesis: 'Enabling the feature allows requests.', allowBase: false };

const query = (op, target, extra = {}) => ({ op, target, revision: 'head', scope: null, first: null, last: null,
    version: null, basis: null, query: null, why: 'Determine whether the actual route is allowed.', ...extra });
const inspect = (...requests) => ({ action: 'investigate', requests, verdict: null, reason: null, missing: null, citations: [] });
const finish = (...citations) => ({ action: 'finish', requests: [], verdict: 'refuted',
    reason: 'The unchanged settings disable the reachable path.', missing: null, citations });
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
