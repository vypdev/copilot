import { PullRequest } from '../../../data/model/pull_request';
import { readLifecycleExternalEvidence, resolveLifecycleState } from '../lifecycle_state_policy';

const baseDecision = {
    isIssue: false,
    isPullRequest: true,
    issueOpened: false,
    issueDescriptionEdited: false,
    pullRequestMerged: false,
    pullRequestClosed: false,
    results: [],
};

describe('lifecycle event replay', () => {
    it.each([
        ['pull_request_review', { action: 'submitted', review: { state: 'approved', commit_id: 'sha-1' }, pull_request: { number: 8 } }, 'ready'],
        ['pull_request_review', { action: 'submitted', review: { state: 'changes_requested', commit_id: 'sha-1' }, pull_request: { number: 8 } }, 'changes-requested'],
        ['check_suite', { action: 'completed', check_suite: { head_sha: 'sha-1', status: 'completed', conclusion: 'failure', pull_requests: [{ number: 8 }] } }, 'blocked'],
        ['check_suite', { action: 'completed', check_suite: { head_sha: 'sha-1', status: 'queued', conclusion: null, pull_requests: [{ number: 8 }] } }, 'reviewing'],
        ['workflow_run', { action: 'completed', workflow_run: { head_sha: 'sha-1', status: 'completed', conclusion: 'success', pull_requests: [{ number: 8 }] } }, 'reviewing'],
    ])('replays %s into the expected lifecycle state', (eventName, payload, expectedState) => {
        const eventPayload = payload as {
            review?: { state?: string; commit_id?: string };
            check_suite?: { status?: string; conclusion?: string | null; head_sha?: string };
            workflow_run?: { status?: string; conclusion?: string | null; head_sha?: string };
        };
        const pullRequest = new PullRequest(1, 1, {
            eventName,
            ...payload,
        });
        const evidence = readLifecycleExternalEvidence(eventName === 'pull_request_review'
            ? {
                kind: 'pull-request-review',
                state: eventPayload.review?.state,
                headSha: eventPayload.review?.commit_id,
            }
            : {
                kind: eventName === 'check_suite' ? 'check-suite' : 'workflow-run',
                status: eventPayload.check_suite?.status ?? eventPayload.workflow_run?.status,
                conclusion: eventPayload.check_suite?.conclusion ?? eventPayload.workflow_run?.conclusion,
                headSha: eventPayload.check_suite?.head_sha ?? eventPayload.workflow_run?.head_sha,
            }, 'sha-1');

        expect(pullRequest.isPullRequest).toBe(true);
        expect(pullRequest.number).toBe(8);
        expect(resolveLifecycleState({
            ...baseDecision,
            eventName,
            action: String(payload.action),
            externalEvidence: evidence,
        })).toBe(expectedState);
    });
});
