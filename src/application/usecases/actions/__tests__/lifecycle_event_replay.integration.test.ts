import { buildGithubActionEventInputs } from '../../../../actions/github_event_inputs';
import { Issue } from '../../../../data/model/issue';
import { PullRequest } from '../../../../data/model/pull_request';
import { Tokens } from '../../../../data/model/tokens';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../../domain/copilot_lifecycle';
import {
    SynchronizeLifecycleStateUseCase,
    type LifecycleSynchronizationExecution,
} from '../synchronize_lifecycle_state_use_case';

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
        payload: { review: { state: 'approved', pull_request: { number: 42 } } },
        initialLabels: ['size: M', 'state:reviewing'],
        expectedLabels: ['size: M', 'state:ready', 'state:awaiting-maintainer'],
    },
    {
        name: 'requested changes review',
        eventName: 'pull_request_review',
        action: 'submitted',
        payload: { review: { state: 'changes_requested', pull_request: { number: 42 } } },
        initialLabels: ['state:ready'],
        expectedLabels: ['state:changes-requested', 'state:awaiting-issue-author'],
    },
    {
        name: 'pending check suite',
        eventName: 'check_suite',
        action: 'requested',
        payload: {
            check_suite: {
                status: 'queued',
                conclusion: null,
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
                status: 'completed',
                conclusion: 'failure',
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
                status: 'completed',
                conclusion: 'success',
                pull_requests: [{ number: 42 }],
            },
        },
        initialLabels: ['state:changes-requested'],
        expectedLabels: ['state:reviewing'],
    },
];

describe('lifecycle event replay integration', () => {
    it.each(REPLAY_CASES)('replays $name deterministically', async (replay) => {
        const execution = executionFromReplay(replay);
        const setLabels = jest.fn(async (_owner: string, _repo: string, _number: number, labels: string[]) => {
            execution.labels.currentPullRequestLabels = labels;
        });
        const useCase = new SynchronizeLifecycleStateUseCase({
            getLabels: async () => [...execution.labels.currentPullRequestLabels],
            setLabels,
        });

        const results = await useCase.invoke({ execution, results: [] });

        expect(setLabels).toHaveBeenCalledWith('owner', 'repo', 42, replay.expectedLabels, 'token');
        expect(execution.labels.currentPullRequestLabels).toEqual(replay.expectedLabels);
        expect(results[0]).toMatchObject({
            id: 'SynchronizeCopilotLifecycleStateUseCase',
            success: true,
            executed: true,
        });
    });

    it('skips ambiguous check-suite events instead of writing to an arbitrary pull request', async () => {
        const inputs = buildGithubActionEventInputs({
            eventName: 'check_suite',
            actor: 'octocat',
            repo: { owner: 'owner', repo: 'repo' },
            payload: {
                action: 'completed',
                check_suite: {
                    status: 'completed',
                    conclusion: 'failure',
                    pull_requests: [{ number: 41 }, { number: 42 }],
                },
            },
        });
        const execution = executionFromInputs(inputs, ['state:reviewing']);
        const setLabels = jest.fn();
        const useCase = new SynchronizeLifecycleStateUseCase({
            getLabels: jest.fn(),
            setLabels,
        });

        expect(await useCase.invoke({ execution, results: [] })).toEqual([]);
        expect(setLabels).not.toHaveBeenCalled();
    });
});

function executionFromReplay(replay: ReplayCase): LifecycleSynchronizationExecution {
    const inputs = buildGithubActionEventInputs({
        eventName: replay.eventName,
        actor: 'octocat',
        repo: { owner: 'owner', repo: 'repo' },
        payload: { ...replay.payload, action: replay.action },
    });
    return executionFromInputs(inputs, replay.initialLabels);
}

function executionFromInputs(
    inputs: ReturnType<typeof buildGithubActionEventInputs>,
    currentPullRequestLabels: string[],
): LifecycleSynchronizationExecution {
    return {
        owner: 'owner',
        repo: 'repo',
        eventName: inputs.eventName,
        inputs,
        issueNumber: -1,
        isIssue: false,
        isPullRequest: true,
        issue: new Issue(false, false, 0, inputs),
        pullRequest: new PullRequest(0, 0, 0, inputs),
        labels: {
            currentIssueLabels: [],
            currentPullRequestLabels,
            lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS,
        },
        tokens: new Tokens('token'),
    };
}
