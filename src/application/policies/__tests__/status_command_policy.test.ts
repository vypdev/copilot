import { buildCopilotStatusResult, buildCopilotStatusSnapshot, formatCopilotStatus } from '../status_command_policy';

function execution(overrides: Record<string, unknown> = {}) {
    return {
        owner: 'acme',
        repo: 'demo',
        eventName: 'pull_request',
        isPush: false,
        isIssue: false,
        isPullRequest: true,
        issue: { number: 17 },
        pullRequest: { number: 21, isPullRequestReviewComment: false },
        commit: { branch: 'feature/17-demo' },
        inputs: { action: 'synchronize' },
        labels: {
            currentIssueLabels: ['state:in-progress'],
            currentPullRequestLabels: ['size:m', 'state:reviewing'],
            lifecycle: {
                planned: 'state:planned',
                inProgress: 'state:in-progress',
                reviewing: 'state:reviewing',
                changesRequested: 'state:changes-requested',
                verified: 'state:verified',
                ready: 'state:ready',
                blocked: 'state:blocked',
                awaitingMaintainer: 'state:awaiting-maintainer',
                awaitingIssueAuthor: 'state:awaiting-issue-author',
            },
        },
        currentConfiguration: { results: [] },
        ai: {
            getPullRequestDescriptionMode: () => 'append',
        },
        ...overrides,
    };
}

describe('status command policy', () => {
    it('builds a read-only snapshot from setup facts', () => {
        const snapshot = buildCopilotStatusSnapshot(execution() as never);
        expect(snapshot).toMatchObject({
            target: 'pull-request',
            issueNumber: 17,
            pullRequestNumber: 21,
            branch: 'feature/17-demo',
            lifecycle: 'reviewing',
            pullRequestDescriptionMode: 'append',
        });
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.issueLabels)).toBe(true);
        expect(Object.isFrozen(snapshot.pullRequestLabels)).toBe(true);
    });

    it('copies and freezes finding counts from mutable execution results', () => {
        const findingStates = { open: 2, reopened: 1, resolved: 3 };
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [{ payload: { findingStates } }] },
        }) as never);

        findingStates.open = 99;
        expect(snapshot.activeFindings).toEqual({ open: 2, reopened: 1, resolved: 3 });
        expect(Object.isFrozen(snapshot.activeFindings)).toBe(true);
    });

    it('renders a markdown status result without invoking an agent', () => {
        const result = buildCopilotStatusResult(
            buildCopilotStatusSnapshot(execution() as never),
            'CommentAutomationUseCase',
        );
        expect(result.success).toBe(true);
        expect(result.executed).toBe(true);
        expect(result.steps[0]).toContain('## Copilot status');
    });
});
