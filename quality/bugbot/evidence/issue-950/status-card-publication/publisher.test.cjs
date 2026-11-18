'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const { buildBugbotReviewProjection } = require('../../../../../src/domain/bugbot/review_projection');
const { renderBugbotStatusCard } = require('../../../../../src/application/policies/bugbot_review_presentation_policy');
const { buildBugbotProgressCheckMarker } = require('../../../../../src/application/policies/bugbot_progress_check_observation_policy');
const { publishCard } = require('./publisher.cjs');
const repositoryUrl = 'https://github.com/vypdev/copilot';
const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const lastHead = 'c'.repeat(40);
const source = { repositoryId: 891781467, pullNumber: 951, base, baseRef: 'e'.repeat(40), head, policy: 'default' };

function terminal(sha, locale = 'en') {
    return renderBugbotStatusCard(buildBugbotReviewProjection({
        pullRequestNumber: 951, analyzedHeadSha: sha, verifiedHeadSha: sha, findings: [], coverage: { status: 'complete', sources: [] },
    }), locale, { pullRequestUrl: `${repositoryUrl}/pull/951`, commitUrl: `${repositoryUrl}/commit/${sha}` });
}

function review(sequence, { runId = 14, attempt = 1, state = 'active', current = source, work = {} } = {}) {
    const observation = {
        stage: 'analyzing', headSha: current.head, baseSha: current.base, baseRefSha: current.baseRef, pullNumber: current.pullNumber,
        elapsedMs: sequence * 60000, observedAt: '2026-11-17T21:46:28.847Z', sequence,
        partitions: { completed: sequence, total: 110 }, frames: { ordinal: 1, total: 2 },
        ...work,
    };
    const externalId = ['bugbot', current.pullNumber, current.base, current.head, current.policy, runId, attempt].join(':');
    return { runId, attempt, state, runUrl: `${repositoryUrl}/actions/runs/${runId}/attempts/${attempt}`,
        checkDetails: buildBugbotProgressCheckMarker(observation, externalId) };
}

function setup({ withExisting = true } = {}) {
    let next = Promise.resolve();
    let canonical = withExisting ? { id: 6865721341, body: terminal(lastHead), trusted: true } : undefined;
    let state = { source, review: review(5), locale: 'en-US', repositoryUrl };
    const effects = [];
    const reads = [];
    let onRead;
    const lane = {
        exclusive(repositoryId, pullNumber, operation) {
            assert.equal(repositoryId, source.repositoryId);
            assert.equal(pullNumber, source.pullNumber);
            const task = next.then(() => operation({
                read: async () => {
                    const snapshot = { ...state, canonical };
                    reads.push(snapshot);
                    await onRead?.(snapshot);
                    return snapshot;
                },
                isCurrent: async snapshot => snapshot.source === state.source && snapshot.review === state.review
                    && snapshot.canonical === canonical && snapshot.verifiedBody === state.verifiedBody,
                publish: async ({ id, body }) => {
                    effects.push({ id, body });
                    canonical = { id: id ?? 42, body, trusted: true };
                },
            }));
            next = task.catch(() => {});
            return task;
        },
    };
    return {
        publish: (override = {}) => publishCard({ source, runId: 14, attempt: 1, ...override }, lane),
        effects, reads, update: fields => { state = { ...state, ...fields }; },
        onRead: callback => { onRead = callback; },
        current: () => canonical,
        initial: canonical?.body,
    };
}

test('adds progress above exactly the previous verified bytes and preserves the comment ID', async () => {
    const f = setup();
    assert.equal(await f.publish(), 'updated');
    assert.equal(f.effects[0].id, 6865721341);
    assert.match(f.current().body, /5\/110 partitions validated/);
    assert.match(f.current().body, /Last verified review · `cccccccc`/);
    assert.ok(f.current().body.endsWith(f.initial));
    assert.equal(await f.publish(), 'unchanged');
    assert.equal(f.effects.length, 1);
});

test('first review creates one progress-only card without a terminal marker and completes at the same ID', async () => {
    const f = setup({ withExisting: false });
    assert.equal(await f.publish(), 'created');
    assert.match(f.current().body, /No verified review yet/);
    assert.doesNotMatch(f.current().body, /copilot-bugbot-approval-evidence/);
    assert.equal(await f.publish(), 'unchanged');
    f.update({ review: review(110, { state: 'complete' }), verifiedBody: terminal(head) });
    assert.equal(await f.publish(), 'updated');
    assert.equal(f.effects[1].id, 42);
    assert.equal(f.current().body, terminal(head));
});

test('validates the head after admission and again before writing if a push supersedes the running source', async () => {
    const f = setup();
    const nextSource = { ...source, head: 'd'.repeat(40) };
    f.onRead(() => {
        f.onRead(undefined);
        f.update({ source: nextSource, review: review(1, { runId: 15, current: nextSource }) });
    });
    assert.equal(await f.publish(), 'skipped');
    assert.equal(f.effects.length, 0);
    assert.equal(await f.publish({ source: nextSource, runId: 15 }), 'updated');
    assert.ok(f.current().body.endsWith(f.initial));
    assert.equal(await f.publish(), 'skipped');
    assert.equal(f.effects.length, 1);
});

test('rejects a changed base ref on either the wakeup or the observed progress', async () => {
    const f = setup();
    const nextBaseRef = 'f'.repeat(40);
    assert.equal(await f.publish({ source: { ...source, baseRef: nextBaseRef } }), 'skipped');
    f.update({ review: review(5, { work: { baseRefSha: nextBaseRef } }) });
    assert.equal(await f.publish(), 'skipped');
    assert.deepEqual(f.effects, []);
    assert.equal(f.current().body, f.initial);
});

test('an independent recheck and terminal refresh use fresh state from the same serialized boundary', async () => {
    const f = setup();
    let release;
    let entered;
    const paused = new Promise(resolve => { release = resolve; });
    const gate = new Promise(resolve => { entered = resolve; });
    f.onRead(() => {
        f.onRead(undefined);
        entered();
        return paused;
    });
    const progress = f.publish();
    await gate;
    const delayed = f.publish();
    assert.equal(f.reads.length, 1);
    f.update({ review: review(7), verifiedBody: terminal(head, 'es') });
    release();
    assert.equal(await progress, 'skipped');
    assert.equal(await delayed, 'updated');
    assert.match(f.current().body, /7\/110 partitions validated/);
    assert.ok(f.current().body.endsWith(terminal(head, 'es')));
    const completed = review(110, { state: 'complete' });
    f.update({ review: completed, verifiedBody: terminal(head) });
    assert.deepEqual(await Promise.all([f.publish(), f.publish()]), ['updated', 'unchanged']);
    assert.equal(f.current().body, terminal(head));
});

test('a delayed attempt on the same SHA cannot retire the active retry', async () => {
    const f = setup();
    f.update({ review: review(8, { attempt: 2 }) });
    assert.equal(await f.publish({ attempt: 2 }), 'updated');
    assert.equal(await f.publish({ attempt: 1 }), 'skipped');
    assert.match(f.current().body, /attempts\/2/);
    assert.equal(f.effects.length, 1);
});

test('an interruption keeps the dated observation, run link and last verified bytes', async () => {
    const f = setup();
    f.update({ review: review(37, { state: 'interrupted' }) });
    assert.equal(await f.publish(), 'updated');
    assert.match(f.current().body, /Review failed[\s\S]*37\/110 partitions validated[\s\S]*2026-11-17T21:46:28.847Z/);
    assert.ok(f.current().body.endsWith(f.initial));
    assert.equal(f.effects.length, 1);
});

test('does not clear prior evidence when completion has no validated terminal projection', async () => {
    const f = setup();
    f.update({ review: review(110, { state: 'complete' }) });
    assert.equal(await f.publish(), 'skipped');
    assert.equal(f.current().body, f.initial);
    assert.equal(f.effects.length, 0);
});

test('dry-run never acquires a write lane and a mismatched policy cannot publish', async () => {
    const f = setup();
    assert.equal(await f.publish({ dryRun: true }), 'dry-run');
    assert.equal(f.reads.length, 0);
    assert.equal(await f.publish({ source: { ...source, policy: '1'.repeat(64) } }), 'skipped');
    assert.equal(f.effects.length, 0);
});

test('an older progress observation in the same attempt cannot move the card backward', async () => {
    const f = setup();
    f.update({ review: review(10) });
    assert.equal(await f.publish(), 'updated');
    f.update({ review: review(7) });
    assert.equal(await f.publish(), 'skipped');
    assert.match(f.current().body, /10\/110 partitions validated/);
    assert.equal(f.effects.length, 1);
});

test('a malformed or foreign native evidence link cannot create or update a card', async () => {
    const f = setup();
    f.update({ review: { ...review(10), runUrl: 'https://github.com/other/repo/actions/runs/14/attempts/1' } });
    assert.equal(await f.publish(), 'skipped');
    assert.equal(f.effects.length, 0);
});

test('native completion on failure can reuse its bound terminal observation', async () => {
    const f = setup();
    f.update({ review: review(9, { work: { stage: 'finished', outcome: 'failed', failureCode: 'agent.failed' } }) });
    assert.equal(await f.publish(), 'skipped');
    f.update({ review: review(9, { state: 'interrupted', work: {
        stage: 'finished', outcome: 'failed', failureCode: 'agent.failed', retries: 3, partitions: { completed: 8, total: 110 },
    } }) });
    assert.equal(await f.publish(), 'updated');
    assert.match(f.current().body, /Review failed[\s\S]*8\/110 partitions validated[\s\S]*Partition retries · 3/);
    assert.ok(f.current().body.endsWith(f.initial));
});

test('a foreign progress receipt cannot create or update a card', async () => {
    const f = setup();
    f.update({ review: { ...review(9), checkDetails: review(9, { attempt: 2 }).checkDetails } });
    assert.equal(await f.publish(), 'skipped');
    assert.equal(f.effects.length, 0);
});
