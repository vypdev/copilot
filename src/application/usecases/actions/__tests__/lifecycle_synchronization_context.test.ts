import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../../domain/copilot_lifecycle';
import {
    lifecycleSynchronizationOutcome,
    projectLifecycleSynchronizationContext,
    type LifecycleSynchronizationContextSource,
} from '../lifecycle_synchronization_context';

function source(
    overrides: Partial<LifecycleSynchronizationContextSource> = {},
): LifecycleSynchronizationContextSource {
    return {
        eventName: 'issues',
        issueNumber: 7,
        isIssue: true,
        isPullRequest: false,
        inputs: { action: 'opened' },
        issue: { number: 7, opened: true, descriptionEdited: false },
        pullRequest: { number: 0, isMerged: false, isClosed: false },
        labels: {
            currentIssueLabels: ['bug'],
            currentPullRequestLabels: [],
            lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS,
        },
        ...overrides,
    };
}

describe('lifecycle synchronization context', () => {
    it('projects and freezes an issue snapshot without repository authority or provider DTOs', () => {
        const currentIssueLabels = ['bug'];
        const context = projectLifecycleSynchronizationContext(source({
            labels: {
                currentIssueLabels,
                currentPullRequestLabels: [],
                lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS,
            },
        }));
        currentIssueLabels.push('mutated');

        expect(context).toMatchObject({
            eventName: 'issues',
            action: 'opened',
            target: { kind: 'issue', number: 7, labels: ['bug'], opened: true },
            evidence: { kind: 'none' },
        });
        expect(context).not.toHaveProperty('inputs');
        expect(context).not.toHaveProperty('tokens');
        expect(context).not.toHaveProperty('owner');
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(context.target)).toBe(true);
        expect(Object.isFrozen(context.target?.labels)).toBe(true);
        expect(Object.isFrozen(context.lifecycleLabels)).toBe(true);
    });

    it('gives verified pull-request identity precedence for conversation comments', () => {
        const context = projectLifecycleSynchronizationContext(source({
            eventName: 'issue_comment',
            isIssue: false,
            isPullRequest: true,
            inputs: { action: 'created' },
            pullRequest: { number: 11, isMerged: false, isClosed: false },
            labels: {
                currentIssueLabels: ['issue-label'],
                currentPullRequestLabels: ['pr-label'],
                lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS,
            },
        }));

        expect(context.target).toEqual({
            kind: 'pull-request',
            number: 11,
            labels: ['pr-label'],
            merged: false,
            closed: false,
        });
    });

    it('recognizes a pull-request lifecycle event from its positive target number', () => {
        const context = projectLifecycleSynchronizationContext(source({
            eventName: 'workflow_run',
            isIssue: false,
            pullRequest: { number: 12, isMerged: false, isClosed: false },
        }));
        expect(context.target).toMatchObject({ kind: 'pull-request', number: 12 });
    });

    it('leaves a non-positive target absent', () => {
        const context = projectLifecycleSynchronizationContext(source({
            eventName: 'check_suite',
            issueNumber: -1,
            isIssue: false,
            issue: { number: 0, opened: false, descriptionEdited: false },
            pullRequest: { number: 0, isMerged: false, isClosed: false },
        }));
        expect(context.target).toBeUndefined();
    });

    it.each([
        ['pull_request_review', { review: { state: 'approved', commit_id: 'review-sha' } }, { kind: 'pull-request-review', state: 'approved', headSha: 'review-sha' }],
        ['check_suite', { check_suite: { status: 'completed', conclusion: 'failure', head_sha: 'check-sha' } }, { kind: 'check-suite', status: 'completed', conclusion: 'failure', headSha: 'check-sha' }],
        ['workflow_run', { workflow_run: { status: 'queued', conclusion: null, head_sha: 'run-sha' } }, { kind: 'workflow-run', status: 'queued', conclusion: null, headSha: 'run-sha' }],
    ] as const)('projects bounded %s evidence', (eventName, inputs, expected) => {
        const context = projectLifecycleSynchronizationContext(source({ eventName, inputs }));
        expect(context.evidence).toEqual(expected);
        expect(Object.isFrozen(context.evidence)).toBe(true);
    });

    it('does not retain an event payload head as current provider authority', () => {
        const context = projectLifecycleSynchronizationContext(source({
            eventName: 'pull_request_review',
            inputs: {
                action: 'submitted',
                pull_request: { head: { sha: '  current-sha  ' } },
                review: { state: 'approved', commit_id: 'current-sha' },
            } as LifecycleSynchronizationContextSource['inputs'] & {
                pull_request: { head: { sha: string } };
            },
        }));
        expect(context).not.toHaveProperty('currentPullRequestHeadSha');
        expect(context).not.toHaveProperty('inputs');
    });

    it('copies and freezes explicit outcomes', () => {
        const labels = ['state:ready'];
        const outcome = lifecycleSynchronizationOutcome([], {
            target: { kind: 'pull-request', number: 11 },
            labels,
        });
        labels.push('mutated');
        expect(outcome.labelPatch).toEqual({
            target: { kind: 'pull-request', number: 11 },
            labels: ['state:ready'],
        });
        expect(Object.isFrozen(outcome)).toBe(true);
        expect(Object.isFrozen(outcome.results)).toBe(true);
        expect(Object.isFrozen(outcome.labelPatch)).toBe(true);
        expect(Object.isFrozen(outcome.labelPatch?.target)).toBe(true);
        expect(Object.isFrozen(outcome.labelPatch?.labels)).toBe(true);
    });
});
