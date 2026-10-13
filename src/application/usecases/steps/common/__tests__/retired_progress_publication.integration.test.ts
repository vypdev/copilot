import { reconcileStatusCard } from '../status_card_publication_workflow';
import { renderSemanticStatus, selectSemanticStatusIntents } from '../../../../policies/semantic_result_publication_policy';
import { buildRetiredProgressComment } from '../../../../policies/retired_progress_presentation_policy';
import { Result } from '../../../../../data/model/result';
import { bindPublicationSourceQuery } from '../../../../../infrastructure/composition/shared_capability_port_binding';
const sha = 'a'.repeat(40);
const intent = selectSemanticStatusIntents({ locale: 'en-US', results: [new Result({ id: 'CheckProgressUseCase', success: true, executed: true,
  payload: { issueNumber: 42, progress: 98, summary: 'A fresh assessment', branch: 'feature/42', sourceHeadSha: sha } })] })[0];
const context = { owner: 'o', repository: 'r', botLogin: 'bot', intent };
function fixture(stored: { id: number; body: string; user: { login: string } }[] = []) {
  const comments = { listIssueComments: jest.fn(async () => stored), addComment: jest.fn(async () => {}),
    updateComment: jest.fn(async () => {}), removeComment: jest.fn(async (): Promise<'removed' | 'compaction-required'> => 'removed') };
  const source = { getBranchHeadSha: jest.fn(async () => sha), isIssueOpen: jest.fn(async () => true) };
  return { stored, comments, source };
}
it('withholds active progress for a closed issue before reading the comment inventory', async () => {
  const f = fixture(); f.source.isIssueOpen.mockResolvedValue(false);
  expect(await reconcileStatusCard(context, f.comments, f.source)).toMatchObject({ effect: 'unchanged', reason: 'stale-source' });
  expect(f.comments.listIssueComments).not.toHaveBeenCalled(); expect(f.comments.addComment).not.toHaveBeenCalled();
});
it('fails closed when the native state capability is absent', async () => {
  const f = fixture(); await expect(reconcileStatusCard(context, f.comments, { getBranchHeadSha: f.source.getBranchHeadSha })).rejects.toMatchObject({ code: 'configuration.unsupported' });
  expect(f.comments.addComment).not.toHaveBeenCalled();
});
it('retains historical progress when a native read is denied', async () => {
  const f = fixture(); f.source.isIssueOpen.mockRejectedValue(new Error('denied'));
  await expect(reconcileStatusCard(context, f.comments, f.source)).rejects.toThrow('denied'); expect(f.comments.updateComment).not.toHaveBeenCalled();
});
it.each(['create', 'update', 'delete', 'compact'])('rechecks native closure immediately before %s', async operation => {
  const old = renderSemanticStatus({ ...intent, digest: '1111111111111111' });
  const f = fixture(operation === 'create' ? [] : [{ id: 1, body: operation === 'update' ? old : renderSemanticStatus(intent), user: { login: 'bot' } }]);
  if (operation === 'delete' || operation === 'compact') f.stored.push({ id: 2, body: renderSemanticStatus(intent), user: { login: 'bot' } });
  f.source.isIssueOpen.mockResolvedValueOnce(true);
  if (operation === 'compact') {
    f.source.isIssueOpen.mockResolvedValueOnce(true);
    f.comments.removeComment.mockResolvedValue('compaction-required');
  }
  f.source.isIssueOpen.mockResolvedValue(false);
  expect(await reconcileStatusCard(context, f.comments, f.source)).toMatchObject({ reason: 'stale-source' });
  expect(f.comments.addComment).not.toHaveBeenCalled(); expect(f.comments.updateComment).not.toHaveBeenCalled(); if (operation === 'compact') expect(f.comments.removeComment).toHaveBeenCalledTimes(1);
  else expect(f.comments.removeComment).not.toHaveBeenCalled();
});
it('updates the same historical card only after reopening and a fresh branch assessment', async () => {
  const historical = buildRetiredProgressComment(renderSemanticStatus(intent), 'en-US', 'completed')!;
  const f = fixture([{ id: 81, body: historical, user: { login: 'bot' } }]);
  expect(await reconcileStatusCard(context, f.comments, f.source)).toMatchObject({ effect: 'updated', canonicalCommentId: 81 });
  expect(f.comments.updateComment).toHaveBeenCalledWith(42, 81, renderSemanticStatus(intent)); expect(f.comments.addComment).not.toHaveBeenCalled();
});
it.each(['closed', 'foreign', 'open'] as const)('binds a frozen read-only native %s capability to the exact issue', async kind => {
  const readIssue = jest.fn(async () => ({ number: kind === 'foreign' ? 43 : 42, state: kind === 'closed' ? 'closed' as const : 'open' as const,
    reason: kind === 'closed' ? 'completed' as const : 'reopened' as const, labels: [] }));
  const source = bindPublicationSourceQuery({ getBranchHeadSha: jest.fn(async () => sha) }, { owner: 'o', repository: 'r', token: 'credential' }, { readIssue });
  expect(Object.isFrozen(source)).toBe(true); expect(await source.isIssueOpen!(42)).toBe(kind === 'open');
  expect(readIssue).toHaveBeenCalledWith(42); expect(source).not.toHaveProperty('close');
});
