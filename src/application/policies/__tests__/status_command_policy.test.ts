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
        const findingStates = {
            open: 2,
            reopened: 1,
            fixed: 1,
            obsolete: 1,
            dismissed: 1,
            'verification-required': 0,
            unknown: 0,
        };
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [{ payload: { findingStates } }] },
        }) as never);

        findingStates.open = 99;
        expect(snapshot.findingStates).toEqual({
            open: 2,
            reopened: 1,
            verificationRequired: 0,
            unknown: 0,
            resolved: 3,
        });
        expect(Object.isFrozen(snapshot.findingStates)).toBe(true);
    });

    it('surfaces malformed owned finding-state evidence without inventing counts', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [{ payload: { findingStates: { open: 1 } } }] },
        }) as never);

        expect(snapshot.findingStates).toBeUndefined();
        expect(snapshot.findingStateEvidence).toBe('invalid');
        expect(formatCopilotStatus(snapshot)).toContain('invalid evidence; inspect the workflow result.');
    });

    it('surfaces missing required review finding-state evidence as invalid', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [{ payload: {
                bugbotTelemetry: { schemaVersion: 1, outcome: 'no-findings', elapsedMs: 10, configuredEffort: 'smart', headSha: 'sha-123' },
            } }] },
        }) as never);

        expect(snapshot.findingStates).toBeUndefined();
        expect(snapshot.findingStateEvidence).toBe('invalid');
    });

    it('renders every non-clean finding state explicitly', () => {
        const snapshot = buildCopilotStatusSnapshot(execution({
            currentConfiguration: { results: [{ payload: { findingStates: {
                open: 1,
                reopened: 2,
                fixed: 1,
                obsolete: 1,
                dismissed: 1,
                'verification-required': 3,
                unknown: 4,
            } } }] },
        }) as never);

        expect(formatCopilotStatus(snapshot)).toContain('1 open, 2 reopened, 3 verification required, 4 unknown, 3 resolved');
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
