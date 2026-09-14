import { buildGithubActionEventInputs } from '../../../../actions/github_event_inputs';
import { Issue } from '../../../../data/model/issue';
import { PullRequest } from '../../../../data/model/pull_request';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../../domain/copilot_lifecycle';
import {
    projectLifecycleSynchronizationContext,
    type LifecycleSynchronizationContextSource,
} from '../lifecycle_synchronization_context';
import { SynchronizeLifecycleStateUseCase } from '../synchronize_lifecycle_state_use_case';

interface ReplayCase {
    name: string;
    eventName: string;
    action: string;
    payload: Record<string, unknown>;
    initialLabels: string[];
    expectedLabels: string[];
}

const REPLAY_CASES: readonly ReplayCase[] = [
    {
        name: 'approved review',
        eventName: 'pull_request_review',
        action: 'submitted',
        payload: { review: { state: 'approved', commit_id: 'sha-1', pull_request: { number: 42 } } },
        initialLabels: ['size: M', 'state:reviewing'],
        expectedLabels: ['size: M', 'state:ready', 'state:awaiting-maintainer'],
    },
    {
        name: 'requested changes review',
        eventName: 'pull_request_review',
        action: 'submitted',
        payload: { review: { state: 'changes_requested', commit_id: 'sha-1', pull_request: { number: 42 } } },
        initialLabels: ['state:ready'],
        expectedLabels: ['state:changes-requested', 'state:awaiting-issue-author'],
    },
    {
        name: 'pending check suite',
        eventName: 'check_suite',
        action: 'requested',
        payload: {
            check_suite: {
                head_sha: 'sha-1', status: 'queued', conclusion: null,
                pull_requests: [{ number: 42 }],
            },
        },
        initialLabels: ['state:ready'],
        expectedLabels: ['state:reviewing'],
    },
    {
        name: 'failed workflow run',
        eventName: 'workflow_run',
        action: 'completed',
        payload: {
            workflow_run: {
                head_sha: 'sha-1', status: 'completed', conclusion: 'failure',
                pull_requests: [{ number: 42 }],
            },
        },
        initialLabels: ['state:reviewing'],
        expectedLabels: ['state:blocked', 'state:awaiting-maintainer'],
    },
    {
        name: 'successful workflow run',
        eventName: 'workflow_run',
        action: 'completed',
        payload: {
            workflow_run: {
                head_sha: 'sha-1', status: 'completed', conclusion: 'success',
                pull_requests: [{ number: 42 }],
            },
        },
        initialLabels: ['state:changes-requested'],
        expectedLabels: ['state:reviewing'],
    },
];

describe('lifecycle event replay integration', () => {
    it.each(REPLAY_CASES)('replays $name deterministically and becomes idempotent', async (replay) => {
        let providerLabels = [...replay.initialLabels];
        const source = sourceFromReplay(replay);
        const originalLabels = [...source.labels.currentPullRequestLabels];
        const setLabels = jest.fn(async (_number: number, labels: readonly string[]) => {
            providerLabels = [...labels];
        });
        const useCase = new SynchronizeLifecycleStateUseCase({
            getLabels: async () => [...providerLabels],
            setLabels,
        }, { getPullRequestHeadSha: jest.fn().mockResolvedValue('sha-1') });
        const context = projectLifecycleSynchronizationContext(source);

        const outcome = await useCase.invoke({ context, results: [] });
        const replayOutcome = await useCase.invoke({ context, results: [] });

        expect(setLabels).toHaveBeenCalledTimes(1);
        expect(setLabels).toHaveBeenCalledWith(42, replay.expectedLabels);
        expect(providerLabels).toEqual(replay.expectedLabels);
        expect(source.labels.currentPullRequestLabels).toEqual(originalLabels);
        expect(outcome.labelPatch?.labels).toEqual(replay.expectedLabels);
        expect(outcome.results[0]).toMatchObject({
            id: 'SynchronizeCopilotLifecycleStateUseCase', success: true, executed: true,
        });
        expect(replayOutcome).toEqual({ results: [] });
    });

    it('skips ambiguous check-suite events instead of writing to an arbitrary pull request', async () => {
        const inputs = buildGithubActionEventInputs({
            eventName: 'check_suite',
            actor: 'octocat',
            repo: { owner: 'owner', repo: 'repo' },
            payload: {
                action: 'completed',
                check_suite: {
                    head_sha: 'sha-1', status: 'completed', conclusion: 'failure',
                    pull_requests: [{ number: 41 }, { number: 42 }],
                },
            },
        });
        const context = projectLifecycleSynchronizationContext(sourceFromInputs(inputs, ['state:reviewing']));
        const getLabels = jest.fn();
        const setLabels = jest.fn();
        const getPullRequestHeadSha = jest.fn();
        const useCase = new SynchronizeLifecycleStateUseCase(
            { getLabels, setLabels },
            { getPullRequestHeadSha },
        );

        expect(await useCase.invoke({ context, results: [] })).toEqual({ results: [] });
        expect(getLabels).not.toHaveBeenCalled();
        expect(setLabels).not.toHaveBeenCalled();
        expect(getPullRequestHeadSha).not.toHaveBeenCalled();
    });
});

function sourceFromReplay(replay: ReplayCase): LifecycleSynchronizationContextSource {
    const inputs = buildGithubActionEventInputs({
        eventName: replay.eventName,
        actor: 'octocat',
        repo: { owner: 'owner', repo: 'repo' },
        payload: { ...replay.payload, action: replay.action },
    });
    return sourceFromInputs(inputs, replay.initialLabels);
}

function sourceFromInputs(
    inputs: ReturnType<typeof buildGithubActionEventInputs>,
    currentPullRequestLabels: string[],
): LifecycleSynchronizationContextSource {
    const issue = new Issue(false, false, 0, inputs);
    const pullRequest = new PullRequest(0, 0, inputs);
    return {
        eventName: inputs.eventName ?? '',
        inputs,
        issueNumber: -1,
        isIssue: false,
        isPullRequest: pullRequest.isPullRequest,
        issue: {
            number: issue.number,
            opened: issue.opened,
            descriptionEdited: issue.descriptionEdited,
        },
        pullRequest: {
            number: pullRequest.number,
            isMerged: pullRequest.isMerged,
            isClosed: pullRequest.isClosed,
        },
        labels: {
            currentIssueLabels: [],
            currentPullRequestLabels,
            lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS,
        },
    };
}
