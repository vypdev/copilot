import { readCopilotStatus } from '../read_copilot_status_workflow';
import type { CommentAutomationContext } from '../comment_automation_context';
import type { SddEvidenceSnapshot } from '../../ports/sdd_evidence_read_ports';
const firstSha = 'a'.repeat(40), currentSha = 'b'.repeat(40);
function fixture() {
  const context = { trustedBotLogin: 'bot', status: { owner: 'o', repository: 'r', event: 'issue_comment', action: 'created',
    target: 'issue', issueNumber: 7, issueLabels: ['feature', 'in-progress'], pullRequestLabels: [], pullRequestDescriptionMode: 'off',
    sddReadiness: { state: 'unavailable', required: true } },
    sdd: { issueNumber: 7, admittedKind: 'feature', issueAuthor: 'author', trustedBotLogin: 'bot', preBranchSdd: true, issueManagedBranches: true } } as unknown as CommentAutomationContext;
  const evidence: SddEvidenceSnapshot = { state: 'published', path: 'specs/feature.md', cardId: 9,
    verified: { path: 'specs/feature.md', capabilityId: 'issue-start', branchName: 'feature/7', branchHeadSha: currentSha, firstSha, currentSha } };
  const query = { serverOrigin: 'https://github.example.test', read: jest.fn(async (): Promise<SddEvidenceSnapshot> => evidence) };
  return { context, query };
}
describe('shared SDD status workflow integration', () => {
  it('reads and projects immutable readiness independently of the PR read adapter', async () => {
    const f = fixture(); const result = await readCopilotStatus(f.context, 'Status', undefined, f.query);
    expect(f.query.read).toHaveBeenCalledWith(f.context.sdd);
    expect(result.payload).toMatchObject({ status: { issueNumber: 7, serverOrigin: f.query.serverOrigin,
      sddReadiness: { state: 'ready', path: 'specs/feature.md', firstCommitSha: firstSha, commitSha: currentSha } } });
  });
  it('keeps other status facts and withholds readiness on unavailable SDD evidence', async () => {
    const f = fixture(); f.query.read.mockResolvedValue({ state: 'unavailable' });
    expect((await readCopilotStatus(f.context, 'Status', undefined, f.query)).payload).toMatchObject({ status: {
      owner: 'o', repository: 'r', issueNumber: 7, sddReadiness: { state: 'unavailable', required: true } } });
  });
  it.each(['foreign-issue', 'absent-initial-readiness', 'PR-target', 'absent-SDD-context'])('does not query %s evidence', async variant => {
    const f = fixture();
    const context = { ...f.context, status: { ...f.context.status,
      ...(variant === 'foreign-issue' ? { issueNumber: 8 } : {}),
      ...(variant === 'absent-initial-readiness' ? { sddReadiness: undefined } : {}),
      ...(variant === 'PR-target' ? { target: 'pull-request' as const } : {}),
    }, ...(variant === 'absent-SDD-context' ? { sdd: undefined } : {}) };
    await readCopilotStatus(context, 'Status', undefined, f.query);
    expect(f.query.read).not.toHaveBeenCalled();
  });
});
