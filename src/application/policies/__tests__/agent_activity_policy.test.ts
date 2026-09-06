import { shouldTrackAgentActivity } from '../agent_activity_policy';

function execution(overrides: Record<string, unknown> = {}): any {
    return {
        eventName: 'issues',
        issueNumber: 7,
        issue: { number: 7, opened: true, descriptionEdited: false, commentBody: '' },
        pullRequest: { number: 0, action: '', commentBody: '' },
        commit: { commits: [] },
        singleAction: {
            isThinkAction: false,
            isRecommendStepsAction: false,
            isCheckProgressAction: false,
            isDetectPotentialProblemsAction: false,
        },
        ai: {
            getAgentConfiguration: jest.fn(() => ({ model: 'model', command: 'agent' })),
            getAiPullRequestDescription: jest.fn(() => false),
        },
        ...overrides,
    };
}

describe('agent activity policy', () => {
    it('tracks issue analysis only for issue open or description changes', () => {
        expect(shouldTrackAgentActivity(execution(), 'issue')).toBe(true);
        expect(shouldTrackAgentActivity(execution({ issue: { number: 7, opened: false, descriptionEdited: false } }), 'issue')).toBe(false);
    });

    it('tracks agent-backed pull request review events', () => {
        expect(shouldTrackAgentActivity(execution({
            eventName: 'pull_request',
            issueNumber: -1,
            issue: { number: -1, opened: false, descriptionEdited: false },
            pullRequest: { number: 12, action: 'synchronize', commentBody: '' },
        }), 'pull-request')).toBe(true);
    });

    it('tracks non-empty issue and review comments when an agent is configured', () => {
        expect(shouldTrackAgentActivity(execution({
            eventName: 'issue_comment',
            issue: { number: 7, commentBody: 'Please review this' },
        }), 'issue-comment')).toBe(true);
        expect(shouldTrackAgentActivity(execution({
            eventName: 'pull_request_review_comment',
            issueNumber: -1,
            issue: { number: -1, commentBody: '' },
            pullRequest: { number: 12, action: 'created', commentBody: 'Please fix this' },
        }), 'pull-request-review-comment')).toBe(true);
    });

    it('does not track metadata-only pull request edits as agent activity', () => {
        const unavailable = { model: '', command: '' };
        const available = { model: 'model', command: 'agent' };
        expect(shouldTrackAgentActivity(execution({
            eventName: 'pull_request',
            issueNumber: -1,
            issue: { number: -1 },
            pullRequest: { number: 12, action: 'edited', commentBody: '' },
            ai: {
                getAgentConfiguration: jest.fn((task: string) => task === 'planner' ? available : unavailable),
                getAiPullRequestDescription: jest.fn(() => true),
            },
        }), 'pull-request')).toBe(false);
    });

    it('tracks push analysis only when commits and findings configuration exist', () => {
        expect(shouldTrackAgentActivity(execution({
            eventName: 'push',
            commit: { commits: [{ id: 'commit-1' }] },
        }), 'push')).toBe(true);
        expect(shouldTrackAgentActivity(execution({
            eventName: 'push',
            commit: { commits: [] },
        }), 'push')).toBe(false);
    });

    it('tracks only supported agent-backed single actions', () => {
        expect(shouldTrackAgentActivity(execution({
            isSingleAction: true,
            singleAction: { isThinkAction: true },
        }), 'single-action')).toBe(true);
        expect(shouldTrackAgentActivity(execution({
            isSingleAction: true,
            singleAction: { isCheckProgressAction: true },
        }), 'single-action')).toBe(true);
        expect(shouldTrackAgentActivity(execution({
            isSingleAction: true,
            singleAction: {},
        }), 'single-action')).toBe(false);
    });

    it('does not track routes without an effective agent configuration', () => {
        expect(shouldTrackAgentActivity(execution({
            ai: {
                getAgentConfiguration: jest.fn(() => ({ model: '', command: '' })),
                getAiPullRequestDescription: jest.fn(() => false),
            },
        }), 'issue')).toBe(false);
    });

    it('does not track a route with no issue or pull request target', () => {
        expect(shouldTrackAgentActivity(execution({ issueNumber: -1, issue: { number: -1 } }), 'issue')).toBe(false);
    });
});
