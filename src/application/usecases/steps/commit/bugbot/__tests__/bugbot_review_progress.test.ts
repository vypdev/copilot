import { BugbotReviewProgress } from '../bugbot_review_progress';
import type { BugbotPullRequestIdentity } from '../../../../../../domain/bugbot/context';

const target: BugbotPullRequestIdentity = {
    number: 951, state: 'open', draft: false, baseRepository: { owner: 'vypdev', name: 'copilot' }, baseSha: 'a'.repeat(40),
    headRepositoryOwner: 'vypdev', headRef: 'feature/950', headSha: 'b'.repeat(40),
};

it('reports unknown totals first, then freezes the plan, coalesces advancement and flushes phase changes', async () => {
    let now = 1_000;
    const observe = jest.fn().mockResolvedValue(undefined);
    const progress = new BugbotReviewProgress(target, { observe }, false, 'en-US', () => now);
    await progress.record('preparing');
    await progress.record('analyzing');
    await progress.record('analyzing', { frames: { ordinal: 1, total: 2 }, partitions: { completed: 0, total: 105 } });
    await progress.record('analyzing', { partitions: { completed: 1, total: 105 } });
    expect(observe.mock.calls).toHaveLength(3);
    expect(observe.mock.calls[0][0].partitions).toBeUndefined();
    now += 300_000;
    await progress.record('analyzing', { partitions: { completed: 48, total: 105 } });
    await progress.record('analyzing', { partitions: { completed: 48, total: 105 } });
    await progress.record('analyzing', { frames: { ordinal: 2, total: 2 }, partitions: { completed: 64, total: 105 } });
    await progress.record('verifying', { candidates: { completed: 0, total: 5 } });
    await progress.record('verifying', { candidates: { completed: 2, total: 5 } });
    await progress.record('finished', {}, 'partial');
    expect(observe.mock.calls.map(([fact]) => fact.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(observe.mock.calls.at(-1)?.[0]).toMatchObject({ outcome: 'partial', elapsedMs: 300_000, candidates: { completed: 2, total: 5 } });
    await progress.record('publishing');
    expect(observe.mock.calls).toHaveLength(7);
});

it('drains ordered updates despite an optional provider failure', async () => {
    let release!: () => void;
    const observe = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }))
        .mockRejectedValueOnce(new Error('optional provider unavailable')).mockResolvedValueOnce(undefined);
    const progress = new BugbotReviewProgress(target, { observe }, true, 'es', () => 1_000);
    const pending = [progress.record('preparing'), progress.record('analyzing'), progress.record('finished', {}, 'dry-run')];
    await Promise.resolve();
    expect(observe).toHaveBeenCalledTimes(1);
    release();
    await expect(Promise.all(pending)).resolves.toEqual([undefined, undefined, undefined]);
    expect(observe.mock.calls.map(([fact, dryRun]) => [fact.stage, dryRun])).toEqual([
        ['preparing', true], ['analyzing', true], ['finished', true],
    ]);
});
