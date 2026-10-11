import { readCopilotDoctor } from '../read_copilot_doctor_workflow';
import { doctorFixture, DOCTOR_HEAD } from './fixtures/runtime_doctor_fixture';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY } from '../../../domain/pull_request_approval_policy';
import type { CommentAutomationContext } from '../comment_automation_context';
import type { GithubRuntimeDoctorProjection } from '../../policies/github_runtime_doctor_presentation_policy';
const projection = (result: Awaited<ReturnType<typeof readCopilotDoctor>>) => (result.payload as { doctor: GithubRuntimeDoctorProjection }).doctor;
const check = (result: Awaited<ReturnType<typeof readCopilotDoctor>>, group: string) => projection(result).report?.checks.find(item => item.group === group)?.state;
const pull = (context: CommentAutomationContext) => ({ ...context, status: { ...context.status, target: 'pull-request' as const, pullRequestNumber: 11 },
    bugbot: { ...context.bugbot, review: { ...context.bugbot.review, target: { ...context.bugbot.review.target, isPullRequest: true } } } });
describe('independent bounded runtime doctor workflow', () => {
    it('reports all applicable valid issue checks and verified default-off without any action', async () => {
        const { context, ports } = doctorFixture(); const result = await readCopilotDoctor(context, 'Issue', ports);
        expect(projection(result).report).toMatchObject({ severity: 'pass' });
        expect(projection(result).report?.primaryAction).toBeUndefined();
        expect(ports.readIssue).toHaveBeenCalledWith(7); expect(ports.pullRequests.getPullRequest).not.toHaveBeenCalled();
        expect(Object.isFrozen(projection(result).report?.checks)).toBe(true);
    });
    it('preserves successful independent reads when policy is denied', async () => {
        const { context, ports } = doctorFixture(); ports.readApprovalPolicy.mockRejectedValue(new Error('SECRET denied'));
        const result = await readCopilotDoctor(context, 'Issue', ports);
        expect(check(result, 'approval-policy')).toBe('unavailable'); expect(check(result, 'workflow-contracts')).toBe('pass');
        expect(JSON.stringify(result)).not.toContain('SECRET');
    });
    it('distinguishes a successfully read malformed policy from denied reads', async () => {
        const { context, ports } = doctorFixture(); ports.readApprovalPolicy.mockResolvedValue({ status: 'available', source: 'repository', value: '{SECRET' });
        const result = await readCopilotDoctor(context, 'Issue', ports); expect(check(result, 'approval-policy')).toBe('blocked');
        expect(projection(result).report?.severity).toBe('blocked'); expect(JSON.stringify(result)).not.toContain('SECRET');
    });
    it.each(['recommend', 'guarded'] as const)('reports declared %s prerequisites without attesting actual producer health', async mode => {
        const { context, ports } = doctorFixture(); ports.readApprovalPolicy.mockResolvedValue({ status: 'available', source: 'organization',
            value: JSON.stringify({ ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY, mode, producerAttested: mode === 'guarded', testChecks: [{ name: 'CI', sourceAppId: 15368, workflowName: 'CI' }],
                coverage: { mode: 'check', checkName: 'CI' } }) });
        const result = await readCopilotDoctor(context, 'Issue', ports); expect(check(result, 'approval-policy')).toBe('pass');
        expect(check(result, 'approval-prerequisites')).toBe('warning');
    });
    it('makes help issue and branch prerequisites not applicable', async () => {
        const { context, ports } = doctorFixture(); ports.readIssue.mockResolvedValue({ number: 7, title: 'Help', labels: ['help', 'in-progress'], body: '### Describe your problem or question\nHelp' });
        const result = await readCopilotDoctor(context, 'Issue', ports); expect(check(result, 'issue-readiness')).toBe('not-applicable');
        expect(check(result, 'linked-branch-readiness')).toBe('not-applicable'); expect(ports.readLinkedBranch).not.toHaveBeenCalled();
    });
    it('retains unrelated results when issue reads fail', async () => {
        const { context, ports } = doctorFixture(); ports.readIssue.mockRejectedValue(new Error('SECRET'));
        const result = await readCopilotDoctor(context, 'Issue', ports); expect(check(result, 'issue-readiness')).toBe('unavailable');
        expect(check(result, 'approval-policy')).toBe('pass');
    });
    it('does not assess a different issue returned by a malformed provider', async () => {
        const { context, ports } = doctorFixture(); ports.readIssue.mockResolvedValue({ number: 8 });
        expect(check(await readCopilotDoctor(context, 'Issue', ports), 'issue-readiness')).toBe('unavailable');
    });
    it('does not guess admission when kind labels are missing', async () => {
        const { context, ports } = doctorFixture(); ports.readIssue.mockResolvedValue({ number: 7, labels: [], body: '', title: 'Unknown' });
        expect(check(await readCopilotDoctor(context, 'Issue', ports), 'issue-readiness')).toBe('unavailable');
    });
    it('blocks a successfully read malformed issue form', async () => {
        const { context, ports } = doctorFixture(); ports.readIssue.mockResolvedValue({ number: 7, labels: ['feature'], body: '', title: 'Invalid' });
        expect(check(await readCopilotDoctor(context, 'Issue', ports), 'issue-readiness')).toBe('blocked');
    });
    it('warns when complete native evidence proves there is no branch', async () => {
        const { context, ports } = doctorFixture(); ports.readLinkedBranch.mockResolvedValue({ state: 'absent' });
        expect(check(await readCopilotDoctor(context, 'Issue', ports), 'linked-branch-readiness')).toBe('warning');
    });
    it('does not turn failed branch reads into a missing branch', async () => {
        const { context, ports } = doctorFixture(); ports.readLinkedBranch.mockRejectedValue(new Error('SECRET'));
        expect(check(await readCopilotDoctor(context, 'Issue', ports), 'linked-branch-readiness')).toBe('unavailable');
    });
    it('refuses a linked branch for a different repository identity', async () => {
        const { context, ports } = doctorFixture(); ports.readLinkedBranch.mockResolvedValue({ state: 'available', repositoryId: 43, headSha: DOCTOR_HEAD });
        expect(check(await readCopilotDoctor(context, 'Issue', ports), 'linked-branch-readiness')).toBe('unavailable');
    });
    it('keeps invalid configuration blocked without losing policy evidence', async () => {
        const { context, ports } = doctorFixture(); const result = await readCopilotDoctor({ ...context,
            doctorConfiguration: { ...context.doctorConfiguration!, issueManagedBranches: false } }, 'Issue', ports);
        expect(check(result, 'effective-configuration')).toBe('blocked'); expect(check(result, 'approval-policy')).toBe('pass');
        expect(ports.readIssue).not.toHaveBeenCalled();
    });
    it('keeps missing composition capabilities unavailable instead of using defaults', async () => {
        const { context } = doctorFixture(); const result = await readCopilotDoctor(context, 'Issue');
        expect(check(result, 'approval-policy')).toBe('unavailable'); expect(result.executed).toBe(true);
    });
    it.each(['wrong-id', 'wrong-sha', 'failed-read'])('refuses %s repository samples while retaining policy results', async reason => {
        const { context, ports } = doctorFixture();
        if (reason === 'failed-read') ports.readRepository.mockRejectedValue(new Error('SECRET'));
        else { const sample = await ports.readRepository(); ports.readRepository.mockResolvedValue({ ...sample,
            ...(reason === 'wrong-id' ? { repositoryId: 43 } : { revision: 'not-a-sha' }) }); }
        const result = await readCopilotDoctor(context, 'Issue', ports); expect(check(result, 'workflow-contracts')).toBe('unavailable');
        expect(check(result, 'approval-policy')).toBe('pass');
        expect(projection(result).report?.primaryAction).toBe('retry');
    });
    it('uses the exact PR event and preserves missing optional issue context as not applicable', async () => {
        const { context, ports } = doctorFixture(); const result = await readCopilotDoctor(pull(context), 'PR', ports);
        expect(check(result, 'pull-request-identity')).toBe('pass'); expect(check(result, 'issue-readiness')).toBe('not-applicable');
        expect(ports.readIssue).not.toHaveBeenCalled(); expect(ports.pullRequests.getPullRequest).toHaveBeenCalledWith(11);
    });
    it('rejects a PR head that changes at the final fence', async () => {
        const { context, ports } = doctorFixture(); ports.pullRequests.getPullRequestHeadSha.mockResolvedValue('b'.repeat(40));
        expect(check(await readCopilotDoctor(pull(context), 'PR', ports), 'pull-request-identity')).toBe('unavailable');
    });
    it('keeps failed exact PR identity reads unavailable without searching other PRs', async () => {
        const { context, ports } = doctorFixture(); ports.pullRequests.getPullRequest.mockRejectedValue(new Error('SECRET'));
        expect(check(await readCopilotDoctor(pull(context), 'PR', ports), 'pull-request-identity')).toBe('unavailable');
        expect(ports.readIssue).not.toHaveBeenCalled();
    });
    it('does not infer a linked issue from an equal PR number', async () => {
        const { context, ports } = doctorFixture(); const pr = pull(context);
        const result = await readCopilotDoctor({ ...pr, status: { ...pr.status, issueNumber: 11 } }, 'PR', ports);
        expect(check(result, 'issue-readiness')).toBe('not-applicable'); expect(ports.readIssue).not.toHaveBeenCalled();
    });
    it('reports missing authoritative repository identity without making remote reads', async () => {
        const { context, ports } = doctorFixture(); const result = await readCopilotDoctor({ ...context,
            bugbot: { ...context.bugbot, review: { ...context.bugbot.review, repository: { owner: 'o', name: 'r' } } } }, 'Issue', ports);
        expect(projection(result).report).toBeUndefined(); expect(ports.readRepository).not.toHaveBeenCalled();
    });
});
