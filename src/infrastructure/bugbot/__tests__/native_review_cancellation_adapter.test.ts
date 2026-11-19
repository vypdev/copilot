import { EventEmitter } from 'node:events';
import { NativeBugbotReviewCancellationAdapter } from '../native_review_cancellation_adapter';
import { composeBugbotReview } from '../../composition/bugbot_review_composition';
import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../domain/bugbot/review_configuration';
import type { BugbotReviewOperationContext } from '../../../application/usecases/steps/commit/bugbot/bugbot_review_operation_context';
import type { BugbotScmPorts } from '../../../application/ports/bugbot_scm_ports';

const clean = (events: EventEmitter) => {
    expect(events.listenerCount('SIGINT')).toBe(0);
    expect(events.listenerCount('SIGTERM')).toBe(0);
};

it('does not observe process signals merely because a native route was composed', () => {
    const events = new EventEmitter();
    new NativeBugbotReviewCancellationAdapter(events);
    clean(events);
});

it.each(['SIGINT', 'SIGTERM'])('links %s only while a review is running and then cleans up', async event => {
    const events = new EventEmitter();
    const adapter = new NativeBugbotReviewCancellationAdapter(events);
    expect(await adapter.withSignal(undefined, async signal => {
        expect(signal.aborted).toBe(false);
        events.emit(event);
        expect(signal.aborted).toBe(true);
        return 'canceled';
    })).toBe('canceled');
    clean(events);
});

it('preserves caller cancellation and unrelated signal listeners', async () => {
    const events = new EventEmitter(), parent = new AbortController(), foreign = jest.fn();
    events.on('SIGTERM', foreign);
    await new NativeBugbotReviewCancellationAdapter(events).withSignal(parent.signal, async signal => {
        parent.abort('caller canceled');
        expect(signal.aborted).toBe(true);
        expect(signal.reason).toBe('caller canceled');
    });
    expect(events.listeners('SIGTERM')).toEqual([foreign]);
    events.emit('SIGTERM');
    expect(foreign).toHaveBeenCalledTimes(1);
});

it('removes native handlers when a review rejects', async () => {
    const events = new EventEmitter(), failure = new Error('controlled failure');
    await expect(new NativeBugbotReviewCancellationAdapter(events).withSignal(undefined, async () => {
        throw failure;
    })).rejects.toBe(failure);
    clean(events);
});

it('disposes remaining review work at scope exit without canceling its caller', async () => {
    const events = new EventEmitter(), parent = new AbortController();
    let remaining: Promise<string> | undefined;
    await new NativeBugbotReviewCancellationAdapter(events).withSignal(parent.signal, async signal => {
        remaining = new Promise(resolve => signal.addEventListener('abort', () => resolve('disposed'), { once: true }));
    });
    await expect(remaining).resolves.toBe('disposed');
    expect(parent.signal.aborted).toBe(false);
    clean(events);
});

it('passes an already canceled caller through without installing native listeners', async () => {
    const events = new EventEmitter(), parent = new AbortController();
    parent.abort();
    await new NativeBugbotReviewCancellationAdapter(events).withSignal(parent.signal, async signal => {
        expect(signal).toBe(parent.signal);
        clean(events);
    });
});

it('cleans up a partially installed handler if registration fails', async () => {
    const events = new EventEmitter(), once = events.once.bind(events), failure = new Error('registration failed');
    jest.spyOn(events, 'once').mockImplementation((event, listener) => {
        if (event === 'SIGTERM') throw failure;
        return once(event, listener);
    });
    await expect(new NativeBugbotReviewCancellationAdapter(events).withSignal(undefined, jest.fn())).rejects.toBe(failure);
    clean(events);
});

it('cancels through the real composed application boundary with zero detector or SCM calls', async () => {
    const events = new EventEmitter(), adapter = new NativeBugbotReviewCancellationAdapter(events);
    const query = jest.fn(() => { throw new Error('no detector dispatch'); });
    const access = jest.fn(() => { throw new Error('no SCM access or write'); });
    const operation: BugbotReviewOperationContext = {
        repository: { owner: 'owner', name: 'repo' }, target: { isPullRequest: true, pullRequestNumber: 1,
            issueNumber: 1, headBranch: 'feature', commitBranch: 'feature', baseBranch: 'main', pullRequestAction: 'opened', draft: false },
        trigger: { kind: 'pull_request', headOwner: 'owner' }, locale: { issue: 'en-US', pullRequest: 'en-US' },
        ignorePatterns: [], organizationRules: [], analysis: { agentConfiguration: { provider: 'codex', model: 'fixture' },
            minimumSeverity: 'low', commentLimit: 20, reviewConfiguration: DEFAULT_BUGBOT_REVIEW_CONFIGURATION },
    };
    const review = composeBugbotReview({ findings: { query }, scm: new Proxy({}, { get: access }) as BugbotScmPorts,
        cancellation: { withSignal: (parent, run) => adapter.withSignal(parent, signal => {
            events.emit('SIGTERM');
            return run(signal);
        }) } });
    const result = await review.invoke(operation);
    expect(result[0]).toMatchObject({ success: false, payload: { bugbotPublicationBlocked: true } });
    expect(query).not.toHaveBeenCalled();
    expect(access).not.toHaveBeenCalled();
    clean(events);
});
