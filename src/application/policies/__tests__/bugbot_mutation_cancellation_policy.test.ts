import { guardBugbotMutationPorts } from '../bugbot_mutation_cancellation_policy';
import type { BugbotScmPorts } from '../../ports/bugbot_scm_ports';

function fixture() {
    const calls: string[] = [];
    const write = async () => { calls.push('write'); };
    const ports = { publication: { issueComments: { addComment: write } },
        resolution: { pullRequestComments: { resolvePullRequestReviewThread: write } },
        reconciliation: { presentation: { statusCard: { publish: write }, updatePullRequestReview: write } },
        progress: { record: write }, context: {},
    } as unknown as BugbotScmPorts;
    return { calls, ports };
}

it('preserves the original ports without a cancellation source', () => {
    const { ports } = fixture();
    expect(guardBugbotMutationPorts(ports)).toBe(ports);
});

it('stops subsequent finding, resolution and nested presentation operations', async () => {
    const { ports, calls } = fixture(), controller = new AbortController();
    const guarded = guardBugbotMutationPorts(ports, controller.signal);
    await guarded.publication.issueComments.addComment(1, 'first');
    controller.abort();
    expect(() => guarded.publication.issueComments.addComment(1, 'second')).toThrow();
    expect(() => guarded.resolution.pullRequestComments.resolvePullRequestReviewThread(1, 'thread')).toThrow();
    expect(() => guarded.reconciliation.presentation.statusCard!.publish({ pullRequestNumber: 1, headSha: 'a', body: 'status' })).toThrow();
    expect(calls).toEqual(['write']);
    expect(guarded.progress).toBe(ports.progress);
});

it('does not retract a request already in flight when cancellation arrives', async () => {
    const controller = new AbortController(), { ports } = fixture();
    const effects: string[] = [];
    ports.publication.issueComments.addComment = async () => { controller.abort(); effects.push('completed'); };
    const guarded = guardBugbotMutationPorts(ports, controller.signal);
    await guarded.publication.issueComments.addComment(1, 'first');
    expect(effects).toEqual(['completed']);
    expect(() => guarded.reconciliation.presentation.updatePullRequestReview(1, 'review', 'body')).toThrow();
});

it('preserves adapter method receivers and optional capability data', async () => {
    const { ports } = fixture(), controller = new AbortController();
    const receiver = { value: 'expected', async addComment() { return this.value; }, optional: null };
    ports.publication.issueComments = receiver as unknown as typeof ports.publication.issueComments;
    const guarded = guardBugbotMutationPorts(ports, controller.signal);
    await expect(guarded.publication.issueComments.addComment(1, 'body')).resolves.toBe('expected');
    expect((guarded.publication.issueComments as unknown as { optional: null }).optional).toBeNull();
    expect((guarded.publication.issueComments as unknown as { value: string }).value).toBe('expected');
});

it('blocks an already canceled operation before invoking the adapter', () => {
    const { ports, calls } = fixture(), controller = new AbortController();
    controller.abort();
    const guarded = guardBugbotMutationPorts(ports, controller.signal);
    expect(() => guarded.publication.issueComments.addComment(1, 'body')).toThrow();
    expect(calls).toEqual([]);
});

it('guards frozen capabilities while preserving their enumerable surface', async () => {
    const { ports, calls } = fixture(), controller = new AbortController();
    Object.freeze(ports.publication.issueComments);
    Object.freeze(ports.publication);
    const guarded = guardBugbotMutationPorts(ports, controller.signal);
    const copied = { ...guarded.publication };
    expect(Object.getOwnPropertyDescriptor(guarded.publication, 'missing')).toBeUndefined();
    await copied.issueComments.addComment(1, 'first');
    controller.abort();
    expect(() => copied.issueComments.addComment(1, 'second')).toThrow();
    expect(calls).toEqual(['write']);
});
