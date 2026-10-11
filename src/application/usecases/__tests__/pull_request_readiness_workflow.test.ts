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
    it('discards old counts and readiness when head moves after the revision fence during the policy read', async () => {
        const f = readinessFixture();
        f.ports.approval.readPolicy.mockResolvedValueOnce(readinessPolicy()).mockImplementationOnce(async () => {
            f.ports.getPullRequestHeadSha.mockResolvedValue('d'.repeat(40));
            return readinessPolicy();
        });
        expect(await status(f)).toMatchObject({ findingStates: undefined, findingStateEvidence: 'invalid',
            pullRequestReadiness: { readiness: 'unavailable', code: 'final-identity-unavailable' } });
        expect(f.ports.getPullRequestHeadSha).toHaveBeenCalledTimes(1);
    });
    it('cannot certify readiness or counts when the independent final head read is denied', async () => {
        const f = readinessFixture(); f.ports.getPullRequestHeadSha.mockRejectedValue({ status: 403 });
        expect(await status(f)).toMatchObject({ findingStates: undefined, findingStateEvidence: 'invalid',
            pullRequestReadiness: { readiness: 'unavailable', code: 'final-identity-unavailable' } });
    });
    it.each(['policy', 'head lookup'])('detects a base advancement during the final %s read', async during => {
        const f = readinessFixture();
        const moveBase = () => f.ports.approval.readRevision.mockResolvedValue({ repositoryId: 1, pullNumber: 11,
            headSha: READINESS_HEAD, baseSha: 'd'.repeat(40) });
        if (during === 'policy') f.ports.approval.readPolicy.mockResolvedValueOnce(readinessPolicy()).mockImplementationOnce(async () => {
            moveBase(); return readinessPolicy();
        });
        else f.ports.getPullRequestHeadSha.mockImplementationOnce(async () => { moveBase(); return READINESS_HEAD; });
        expect(await status(f)).toMatchObject({ findingStates: { open: 0 }, pullRequestReadiness: { readiness: 'pending',
            code: 'superseded', evidence: { ci: 'pending', coverage: 'pending', bugbot: 'pending', reviews: 'pending' } } });
    });
    it.each(['changed head', 'denied head'])('discards every old gate when CI was already pending and the final read has %s', async reason => {
        const f = readinessFixture(); const e = readinessEvidence();
        f.ports.approval.loadEvidence.mockResolvedValue({ ...e, checks: [{ ...e.checks[0], status: 'in_progress', conclusion: null }] });
        if (reason === 'changed head') f.ports.getPullRequestHeadSha.mockResolvedValue('d'.repeat(40));
        else f.ports.getPullRequestHeadSha.mockRejectedValue({ status: 403 });
        expect(await status(f)).toMatchObject({ findingStates: undefined, findingStateEvidence: 'invalid',
            pullRequestReadiness: { readiness: 'unavailable', code: 'final-identity-unavailable',
                evidence: { ci: 'unavailable', coverage: 'unavailable', bugbot: 'unavailable', reviews: 'unavailable' } } });
    });
    it('retains verified native groups in off mode without offering observer or approval actions', async () => {
        const f = readinessFixture(); f.ports.approval.readPolicy.mockResolvedValue(readinessPolicy('off'));
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'not-applicable', mode: 'off', action: 'none',
            evidence: { ci: 'satisfied', coverage: 'satisfied', bugbot: 'satisfied', reviews: 'satisfied' } });
    });
    it('keeps a freshly verified off policy disabled when optional evidence is denied', async () => {
        const f = readinessFixture(); f.ports.approval.readPolicy.mockResolvedValue(readinessPolicy('off'));
        f.ports.approval.loadEvidence.mockRejectedValue({ status: 403 });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'not-applicable', mode: 'off', code: 'disabled',
            action: 'none', evidence: { ci: 'unavailable', coverage: 'unavailable', bugbot: 'unavailable', reviews: 'unavailable' } });
        expect(f.ports.approval.readPolicy).toHaveBeenCalledTimes(2);
    });
    it('cannot keep off mode after its final policy read is denied', async () => {
        const f = readinessFixture(); f.ports.approval.readPolicy.mockResolvedValueOnce(readinessPolicy('off')).mockRejectedValueOnce({ status: 403 });
        f.ports.approval.loadEvidence.mockRejectedValue({ status: 403 });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', mode: 'unavailable', code: 'final-evidence-unavailable' });
    });
    it('discards the disabled assessment if policy changes after denied optional evidence', async () => {
        const f = readinessFixture(); f.ports.approval.readPolicy.mockResolvedValueOnce(readinessPolicy('off')).mockResolvedValueOnce(readinessPolicy('recommend'));
        f.ports.approval.loadEvidence.mockRejectedValue({ status: 403 });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', mode: 'unavailable', code: 'policy-superseded' });
    });
    it('keeps off disabled after head movement while discarding all stale native groups', async () => {
        const f = readinessFixture(); f.ports.approval.readPolicy.mockResolvedValue(readinessPolicy('off'));
        f.ports.getPullRequestHeadSha.mockResolvedValue('d'.repeat(40));
        expect(await status(f)).toMatchObject({ findingStates: undefined, pullRequestReadiness: { readiness: 'not-applicable', mode: 'off',
            code: 'disabled', headSha: '', baseSha: '', evidence: { ci: 'unavailable', coverage: 'unavailable', bugbot: 'unavailable', reviews: 'unavailable' } } });
    });
    it('keeps off disabled without trusting native evidence from another target', async () => {
        const f = readinessFixture(); f.ports.approval.readPolicy.mockResolvedValue(readinessPolicy('off'));
        f.ports.approval.loadEvidence.mockResolvedValue(readinessEvidence({ repositoryId: 99 }));
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'not-applicable', mode: 'off', code: 'disabled',
            evidence: { ci: 'unavailable', coverage: 'unavailable', bugbot: 'unavailable', reviews: 'unavailable' } });
    });
    it('retains disabled policy but withholds native gates after a denied final complete revision', async () => {
        const f = readinessFixture(); f.ports.approval.readPolicy.mockResolvedValue(readinessPolicy('off'));
        f.ports.approval.readRevision.mockRejectedValue({ status: 403 });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'not-applicable', mode: 'off', code: 'disabled', headSha: '',
            evidence: { ci: 'unavailable', coverage: 'unavailable', bugbot: 'unavailable', reviews: 'unavailable' } });
    });
    it('withholds all readiness when the canonical PR lookup is denied', async () => {
        const f = readinessFixture(); f.ports.getPullRequest.mockRejectedValue({ status: 403 });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', code: 'identity-unavailable' });
        expect(f.ports.approval.loadEvidence).not.toHaveBeenCalled();
    });
    it('withholds approval facts when the final complete revision lookup is denied', async () => {
        const f = readinessFixture(); f.ports.approval.readRevision.mockRejectedValue({ status: 403 });
        expect((await status(f)).pullRequestReadiness).toMatchObject({ readiness: 'unavailable', code: 'final-evidence-unavailable',
            evidence: { ci: 'unavailable', coverage: 'unavailable', bugbot: 'unavailable', reviews: 'unavailable' } });
    });
    it('discards already collected facts when final native linkage is denied', async () => {
        const f = readinessIssueFixture();
        f.ports.readLinkedPullRequests.mockResolvedValueOnce({ state: 'available', repositoryId: 1, issueNumber: 7, numbers: [11] })
            .mockRejectedValueOnce({ status: 403 });
        expect(await status(f)).toMatchObject({ findingStates: undefined, findingStateEvidence: 'invalid',
            pullRequestReadiness: { readiness: 'unavailable', code: 'linkage-unavailable' } });
    });
    it('never treats evidence collected for a later head as the originally selected snapshot', async () => {
        const f = readinessFixture(); f.ports.approval.loadEvidence.mockResolvedValue(readinessEvidence({ headSha: 'd'.repeat(40) }));
        f.ports.approval.readRevision.mockResolvedValue({ repositoryId: 1, pullNumber: 11, headSha: 'd'.repeat(40), baseSha: READINESS_BASE });
        expect(await status(f)).toMatchObject({ findingStates: undefined, pullRequestReadiness: { readiness: 'pending', code: 'superseded',
            evidence: { ci: 'pending', coverage: 'pending', bugbot: 'pending', reviews: 'pending' } } });
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
