import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';
import { buildBugbotProgressCheckMarker } from '../bugbot_progress_check_observation_policy';
import { renderBugbotStatusCard } from '../bugbot_review_presentation_policy';
import {
    isBugbotCanonicalStatusCard, publishBugbotStatusCard,
    type BugbotStatusCardPublicationLane, type BugbotStatusCardSnapshot,
} from '../bugbot_status_card_publication_policy';

const url = 'https://github.com/vypdev/copilot';
const source = { repositoryId: 9, pullNumber: 951,
    base: 'a'.repeat(40), baseRef: 'd'.repeat(40), head: 'b'.repeat(40), policy: 'f'.repeat(64) };
const native = { runId: 15, attempt: 1 };
const wake = { source, ...native, dryRun: false };

function terminal(head: string, coverage: 'partial' | 'complete' = 'complete'): string {
    return renderBugbotStatusCard(buildBugbotReviewProjection({ pullRequestNumber: 951, analyzedHeadSha: head,
        verifiedHeadSha: head, findings: [], coverage: { status: coverage, sources: [] } }),
    'en-US', { pullRequestUrl: url + '/pull/951', commitUrl: url + '/commit/' + head });
}

function review(sequence: number, options: { context?: typeof source; attempt?: number; completed?: number } = {}):
    BugbotStatusCardSnapshot['review'] {
    const context = options.context ?? source;
    const attempt = options.attempt ?? 1;
    const id = ['bugbot', context.pullNumber, context.base, context.head, context.policy, native.runId, attempt].join(':');
    const checkDetails = buildBugbotProgressCheckMarker({
        stage: 'analyzing', headSha: context.head, baseSha: context.base, baseRefSha: context.baseRef,
        sequence, observedAt: '2026-11-18T00:15:00.000Z', elapsedMs: 2345, pullNumber: context.pullNumber,
        partitions: { completed: options.completed ?? 4, total: 16 },
    }, id)!;
    return { ...native, attempt, state: 'active', checkDetails,
        runUrl: url + '/actions/runs/' + native.runId + '/attempts/' + attempt };
}

function setup(initial?: string) {
    let canonical = initial ? { id: 44, body: initial } : undefined;
    let state = { source, review: review(2), repositoryUrl: url, locale: 'en-US' } as BugbotStatusCardSnapshot;
    let queue = Promise.resolve<void>(undefined);
    let onRead: (() => Promise<void>) | undefined;
    const journal: Array<{ id?: number; body: string }> = [];
    const reads: BugbotStatusCardSnapshot[] = [];
    const lane: BugbotStatusCardPublicationLane = {
        exclusive(repositoryId, pullNumber, operation) {
            expect([repositoryId, pullNumber]).toEqual([source.repositoryId, source.pullNumber]);
            const next = queue.then(() => operation({
                async read() {
                    const current = { ...state, canonical };
                    reads.push(current);
                    await onRead?.();
                    return current;
                },
                async isCurrent(current) {
                    return current.source === state.source && current.review === state.review
                        && current.verifiedBody === state.verifiedBody && current.canonical === canonical;
                },
                async publish(effect) {
                    journal.push(effect);
                    canonical = { id: effect.id ?? 44, body: effect.body };
                },
            }));
            queue = next.then(() => {}, () => {});
            return next;
        },
    };
    return {
        call: (override: Partial<typeof wake> = {}) => publishBugbotStatusCard({ ...wake, ...override }, lane),
        set: (next: Partial<BugbotStatusCardSnapshot>) => { state = { ...state, ...next }; },
        onRead: (callback?: () => Promise<void>) => { onRead = callback; },
        journal, reads, canonical: () => canonical,
    };
}

it('keeps the original verified body while showing observed work and a safe next step', async () => {
    const old = terminal('c'.repeat(40));
    const f = setup(old);
    await expect(f.call()).resolves.toBe('updated');
    expect(f.canonical()?.id).toBe(44);
    expect(f.canonical()?.body).toContain('4/16 partitions validated');
    expect(f.canonical()?.body).toContain('Validate the remaining partitions (12).');
    expect(f.canonical()?.body.endsWith(old)).toBe(true);
    await expect(f.call()).resolves.toBe('unchanged');
    expect(f.journal).toHaveLength(1);
});

it('preserves a same-PR legacy card and upgrades it in place only with a current terminal projection', async () => {
    const old = '<!-- copilot-bugbot-status schema="1" pr="951" verified_head="' + 'c'.repeat(40)
        + '" digest="123456ab" -->\n## 🤖 Bugbot status';
    const f = setup(old);
    await expect(f.call()).resolves.toBe('updated');
    expect(f.canonical()?.body).toContain('Last verified review · `cccccccc`');
    expect(f.canonical()?.body.endsWith(old)).toBe(true);
    await expect(f.call()).resolves.toBe('unchanged');

    const result = terminal(source.head);
    f.set({ review: { ...native, state: 'complete' }, verifiedBody: result.split('\n').slice(1).join('\n') });
    await expect(f.call()).resolves.toBe('skipped');
    f.set({ verifiedBody: result });
    await expect(f.call()).resolves.toBe('updated');
    expect(f.canonical()).toEqual({ id: 44, body: result });
    expect(isBugbotCanonicalStatusCard(old.replace('pr="951"', 'pr="952"'), 951)).toBe(false);
});

it('updates the first-review comment in place with a partial terminal projection', async () => {
    const f = setup();
    await expect(f.call()).resolves.toBe('created');
    const active = f.canonical()!.body;
    expect(active).toContain('No verified review yet');
    expect(active).not.toContain('copilot-bugbot-approval-evidence');
    expect(isBugbotCanonicalStatusCard(active, 951)).toBe(true);
    expect(isBugbotCanonicalStatusCard(active, 952)).toBe(false);
    const result = terminal(source.head, 'partial');
    f.set({ review: { ...native, state: 'complete' }, verifiedBody: result });
    await expect(f.call()).resolves.toBe('updated');
    expect(f.canonical()).toEqual({ id: 44, body: result });
    expect(isBugbotCanonicalStatusCard(result, 951)).toBe(true);
});

it('keeps new native progress when a serialized recheck refreshes the verified projection', async () => {
    const f = setup(terminal('c'.repeat(40)));
    let queued: () => void;
    let release: () => void;
    const enter = new Promise<void>(resolve => { queued = resolve; });
    const pause = new Promise<void>(resolve => { release = resolve; });
    f.onRead(async () => {
        f.onRead();
        queued();
        await pause;
    });
    const stale = f.call();
    await enter;
    const recheck = f.call();
    expect(f.reads).toHaveLength(1);
    const result = terminal(source.head);
    f.set({ review: review(3, { completed: 6 }), verifiedBody: result });
    release!();
    await expect(stale).resolves.toBe('skipped');
    await expect(recheck).resolves.toBe('updated');
    expect(f.canonical()?.body).toContain('6/16 partitions validated');
    expect(f.canonical()?.body.endsWith(result)).toBe(true);
});

it('does not revive queued progress after the terminal write while allowing an exact-head retry', async () => {
    const f = setup();
    await expect(f.call()).resolves.toBe('created');
    const result = terminal(source.head);
    f.set({ review: { ...native, state: 'complete', closeAttempt: true }, verifiedBody: result });
    await expect(f.call()).resolves.toBe('updated');
    expect(f.canonical()?.body).not.toContain('copilot-bugbot-active');
    f.set({ review: review(3), verifiedBody: undefined });
    await expect(f.call()).resolves.toBe('unchanged');
    f.set({ review: review(1, { attempt: 2 }) });
    await expect(f.call({ attempt: 2 })).resolves.toBe('updated');
    expect(f.canonical()?.body).toContain('copilot-bugbot-active');
});

it('rejects superseded comparisons, old attempts, and a conflicting observation with the same sequence', async () => {
    const f = setup(terminal('c'.repeat(40)));
    await expect(f.call()).resolves.toBe('updated');
    f.set({ review: review(2, { completed: 5 }) });
    await expect(f.call()).resolves.toBe('skipped');
    f.set({ review: review(1) });
    await expect(f.call()).resolves.toBe('skipped');
    f.set({ review: review(3, { attempt: 2 }) });
    await expect(f.call()).resolves.toBe('skipped');
    await expect(f.call({ attempt: 2 })).resolves.toBe('updated');
    const next = { ...source, baseRef: 'e'.repeat(40) };
    f.set({ source: next, review: review(3, { context: next }) });
    await expect(f.call()).resolves.toBe('skipped');
    expect(f.journal).toHaveLength(2);
});

it('preserves the verified result after an authenticated interrupted attempt and skips completion without its projection', async () => {
    const previous = terminal('c'.repeat(40));
    const f = setup(previous);
    const active = review(2);
    if (active.state !== 'active') throw new Error('Expected an active fixture');
    f.set({ review: { ...active, state: 'interrupted' } });
    await expect(f.call()).resolves.toBe('updated');
    expect(f.canonical()?.body).toContain('Inspect the workflow before retrying.');
    expect(f.canonical()?.body.endsWith(previous)).toBe(true);
    f.set({ review: { ...native, state: 'complete' } });
    await expect(f.call()).resolves.toBe('skipped');
    expect(f.journal).toHaveLength(1);
});

it('skips write-blocked invocations before reading or acquiring the lane', async () => {
    const f = setup();
    await expect(f.call({ dryRun: true })).resolves.toBe('dry-run');
    expect(f.journal).toHaveLength(0);
    expect(f.reads).toHaveLength(0);
});
