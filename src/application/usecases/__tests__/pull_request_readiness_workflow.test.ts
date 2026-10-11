import { readCopilotStatus } from '../read_copilot_status_workflow';
import { readinessFixture, readinessIssueFixture, readinessPolicy, readinessEvidence, READINESS_HEAD, READINESS_BASE } from './fixtures/pr_readiness_fixture';
import type { CopilotStatusSnapshot } from '../../policies/status_command_policy';
async function status(f: ReturnType<typeof readinessFixture>) {
    const result = await readCopilotStatus(f.context, 'Issue', f.ports);
    return (result.payload as { status: CopilotStatusSnapshot }).status;
}
describe('readiness workflow identity and independent evidence', () => {
    it('collects canonical evidence once and uses a narrow final revision read', async () => {
        const f=readinessFixture(); expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'satisfied', pullNumber: 11 });
        expect(f.ports.approval.loadEvidence).toHaveBeenCalledTimes(1); expect(f.ports.approval.readRevision).toHaveBeenCalledTimes(1);
        expect(f.ports.approval.readPolicy).toHaveBeenCalledTimes(2);
    });
    it('uses only the event PR when the same-number issue exists', async () => {
        const f=readinessFixture(); await status(f); expect(f.ports.readLinkedPullRequests).not.toHaveBeenCalled(); expect(f.ports.getPullRequest).toHaveBeenCalledWith(11);
    });
    it('does not infer a linked PR from the issue number or branch', async () => {
        const f=readinessIssueFixture(); f.ports.readLinkedPullRequests.mockResolvedValue({ state: 'available', repositoryId: 1, issueNumber: 7, numbers: [] });
        const result = await status(f); expect(result.pullRequestReadiness).toMatchObject({ readiness: 'not-applicable', code: 'unlinked-issue' }); expect(result.findingStateEvidence).toBeUndefined(); expect(f.ports.getPullRequest).not.toHaveBeenCalled();
    });
    it('selects the one native same-repository issue PR and fences the association', async () => {
        const f=readinessIssueFixture(); expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'satisfied', pullNumber: 11 });
        expect(f.ports.readLinkedPullRequests).toHaveBeenCalledTimes(2);
    });
    it('refuses multiple native PR links rather than choosing the newest', async () => {
        const f=readinessIssueFixture(); f.ports.readLinkedPullRequests.mockResolvedValue({ state: 'available', repositoryId: 1, issueNumber: 7, numbers: [11,12] });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', action: 'select-pr' }); expect(f.ports.getPullRequest).not.toHaveBeenCalled();
    });
    it('does not interpret incomplete zero-link evidence as absence', async () => {
        const f=readinessIssueFixture(); f.ports.readLinkedPullRequests.mockResolvedValue({ state: 'unavailable' });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', code: 'linkage-unavailable' });
    });
    it('rejects foreign issue repository identity', async () => {
        const f=readinessIssueFixture(); f.ports.readLinkedPullRequests.mockResolvedValue({ state: 'available', repositoryId: 99, issueNumber: 7, numbers: [11] });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable' }); expect(f.ports.getPullRequest).not.toHaveBeenCalled();
    });
    it('rejects duplicate linkage instead of manufacturing one candidate', async () => {
        const f=readinessIssueFixture(); f.ports.readLinkedPullRequests.mockResolvedValue({ state: 'available', repositoryId: 1, issueNumber: 7, numbers: [11,11] });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable' });
    });
    it('invalidates an association which moves during collection', async () => {
        const f=readinessIssueFixture(); f.ports.readLinkedPullRequests.mockResolvedValueOnce({ state: 'available', repositoryId: 1, issueNumber: 7, numbers: [11] })
            .mockResolvedValueOnce({ state: 'available', repositoryId: 1, issueNumber: 7, numbers: [12] });
        expect(await status(f)).toMatchObject({ findingStateEvidence: 'invalid', pullRequestReadiness: { readiness: 'unavailable', code: 'linkage-superseded' } });
    });
    it('keeps CI evidence when the limited Bugbot card read is empty', async () => {
        const f=readinessFixture(); f.ports.listIssueComments.mockResolvedValue({ value: [], coverage: { status: 'complete' } });
        expect(await status(f)).toMatchObject({ findingStateEvidence: 'invalid', pullRequestReadiness: { readiness: 'satisfied', evidence: { ci: 'satisfied' } } });
    });
    it('keeps CI evidence when the Bugbot card read is denied', async () => {
        const f=readinessFixture(); f.ports.listIssueComments.mockRejectedValue({ status: 403 });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'satisfied', evidence: { ci: 'satisfied' } });
    });
    it('retains independently fenced counts after approval evidence is denied', async () => {
        const f=readinessFixture(); f.ports.approval.loadEvidence.mockRejectedValue({ status: 403 });
        expect(await status(f)).toMatchObject({ findingStates: { open: 0 }, pullRequestReadiness: { readiness: 'unavailable', mode: 'unavailable' } });
    });
    it('does not reinterpret denied policy reads as default-off', async () => {
        const f=readinessFixture(); f.ports.approval.readPolicy.mockRejectedValue({ status: 403 });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', mode: 'unavailable' }); expect(f.ports.approval.loadEvidence).not.toHaveBeenCalled();
    });
    it('reports malformed policy as a proven configuration blocker without collecting producer evidence', async () => {
        const f=readinessFixture(); f.ports.approval.readPolicy.mockResolvedValue('{');
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'blocked', mode: 'unavailable', code: 'invalid-policy' }); expect(f.ports.approval.loadEvidence).not.toHaveBeenCalled();
    });
    it('preserves verified default-off without a readiness claim', async () => {
        const f=readinessFixture(); f.ports.approval.readPolicy.mockResolvedValue(undefined);
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'not-applicable', mode: 'off' });
    });
    it('rejects evidence for a foreign PR even when the final provider view would match it', async () => {
        const f=readinessFixture(); f.ports.approval.loadEvidence.mockResolvedValue(readinessEvidence({ pullNumber: 12 }));
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', code: 'target-mismatch' });
    });
    it('refuses canonical reads with a foreign numeric repository identity', async () => {
        const f=readinessFixture(); f.ports.getPullRequest.mockResolvedValue({ ...await f.ports.getPullRequest(), baseRepository: { owner: 'o', name: 'r', id: 99 } });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', code: 'identity-unavailable' });
    });
    it('fences a changed head and discards stale findings', async () => {
        const f=readinessFixture(); f.ports.approval.readRevision.mockResolvedValue({ repositoryId: 1, pullNumber: 11, headSha: 'd'.repeat(40), baseSha: READINESS_BASE });
        expect(await status(f)).toMatchObject({ findingStateEvidence: 'invalid', pullRequestReadiness: { readiness: 'pending', code: 'superseded', evidence: { ci: 'pending' } } });
    });
    it('fences a changed base without losing the correctly fenced current-head count', async () => {
        const f=readinessFixture(); f.ports.approval.readRevision.mockResolvedValue({ repositoryId: 1, pullNumber: 11, headSha: READINESS_HEAD, baseSha: 'd'.repeat(40) });
        expect(await status(f)).toMatchObject({ findingStates: { open: 0 }, pullRequestReadiness: { readiness: 'pending', code: 'superseded' } });
    });
    it('fences a policy change without presenting the earlier satisfied gates', async () => {
        const f=readinessFixture(); f.ports.approval.readPolicy.mockResolvedValueOnce(readinessPolicy()).mockResolvedValueOnce(readinessPolicy('recommend'));
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'pending', evidence: { ci: 'pending', coverage: 'pending' } });
    });
    it('does not claim freshness if the final policy read fails', async () => {
        const f=readinessFixture(); f.ports.approval.readPolicy.mockResolvedValueOnce(readinessPolicy()).mockRejectedValueOnce({ status: 403 });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', code: 'final-evidence-unavailable' });
    });
    it('suppresses all facts after final repository substitution', async () => {
        const f=readinessFixture(); f.ports.approval.readRevision.mockResolvedValue({ repositoryId: 99, pullNumber: 11, headSha: READINESS_HEAD, baseSha: READINESS_BASE });
        expect(await status(f)).toMatchObject({ findingStates: undefined, pullRequestReadiness: { readiness: 'unavailable', code: 'target-mismatch' } });
    });
    it('requires the positive event repository identity before any provider lookup', async () => {
        const f=readinessFixture(); const missing={ ...f, context: { ...f.context, bugbot: { ...f.context.bugbot,
            review: { ...f.context.bugbot.review, repository: { ...f.context.bugbot.review.repository, id: undefined } } } } };
        expect((await status(missing)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable' }); expect(f.ports.getPullRequest).not.toHaveBeenCalled();
    });
    it('does not disclose raw provider exception text', async () => {
        const f=readinessFixture(); f.ports.approval.loadEvidence.mockRejectedValue(new Error('PRIVATE-CREDENTIAL'));
        const result=await readCopilotStatus(f.context,'Issue',f.ports); expect(JSON.stringify(result)).not.toContain('PRIVATE-CREDENTIAL');
    });
});
