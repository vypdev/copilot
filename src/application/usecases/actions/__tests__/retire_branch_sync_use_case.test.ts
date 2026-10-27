import { buildRetiredBranchSyncComment, buildUnrelatedBranchSyncComment, branchSyncPublicationIdentity } from '../../../policies/branch_sync_notification_policy';
import { replyRequestBodyDigest } from '../../../../domain/reply_request_digest';
import type { ReplyRequestSnapshot } from '../../../ports/reply_request_read_ports';
import { RetireBranchSyncUseCase } from '../retire_branch_sync_use_case';
import { buildAlignedBranchSyncComment, buildStaleBranchSyncComment } from '../../../policies/branch_sync_notification_policy';
import { resolveStaticBranchSyncCatalog } from '../../../policies/branch_sync_message_catalog';
import { parsePublicationMarker } from '../../../policies/publication_identity_policy';

const dependency = { issueNumber: 42, parentBranch: 'develop', workingBranch: 'feature/42' };
const catalog = resolveStaticBranchSyncCatalog('en-US');
const warning = buildStaleBranchSyncComment({ owner: 'o', repository: 'r', dependency, comparison: { aheadBy: 1, behindBy: 2 }, messages: catalog });
const context = { issueNumber: 42, locale: 'en-US', trustedBotLogin: 'bot' };
function fixture(body = warning) {
  const stored = [{ id: 8, body, user: { login: 'bot' } }];
  const issues = { readIssue: jest.fn().mockResolvedValue({ number: 42, state: 'closed', reason: 'completed', labels: ['100%'] }) };
  const comments = {
    listIssueComments: jest.fn().mockImplementation(async () => stored.map(c => ({ ...c, user: { ...c.user } }))),
    updateComment: jest.fn().mockImplementation(async (_number: number, id: number, updated: string) => {
      stored.find(c => c.id === id)!.body = updated;
    }),
  };
  const freshness = { matches: jest.fn(async (witness: ReplyRequestSnapshot) => {
    const current = stored.find(comment => comment.id === witness.commentId);
    return witness.surface === 'issue-comment' && witness.target.kind === 'issue' && witness.target.number === 42
      && current?.user.login === witness.author && replyRequestBodyDigest(current?.body ?? '') === witness.bodyDigest;
  }) };
  return { stored, issues, comments, freshness, useCase: new RetireBranchSyncUseCase(issues, comments, freshness) };
}

describe('terminal synchronization recommendation retirement', () => {
  it('preserves the card identity and link while replacing active instructions', async () => {
    const f = fixture(); const [result] = await f.useCase.invoke(context);
    expect(f.comments.updateComment).toHaveBeenCalledWith(42, 8, expect.stringContaining('Issue closed'));
    expect(parsePublicationMarker(f.stored[0].body)?.identity).toEqual(parsePublicationMarker(warning)?.identity);
    expect(f.stored[0].body).not.toContain('/copilot sync-branch');
    expect(f.stored[0].body).toContain('does not certify');
    expect(result).toMatchObject({ success: true, executed: true, payload: { nativeClosed: true, retiredCards: 1 } });
  });
  it('uses complete Spanish copy for a closed not-planned issue without claiming completion', async () => {
    const f = fixture(); f.issues.readIssue.mockResolvedValue({ number: 42, state: 'closed', reason: 'not_planned', labels: [] });
    await f.useCase.invoke({ ...context, locale: 'es-ES' });
    expect(f.stored[0].body).toContain('Issue cerrada'); expect(f.stored[0].body).toContain('no certifica');
    expect(f.stored[0].body).not.toContain('completada');
  });
  it('uses complete English fallback for an unsupported retirement locale', async () => {
    const f = fixture(); const [result] = await f.useCase.invoke({ ...context, locale: 'fr-FR' });
    expect(result).toMatchObject({ success: true, payload: { retiredCards: 1 } });
    expect(f.stored[0].body).toContain('Issue closed'); expect(f.stored[0].body).toContain('does not certify');
    expect(parsePublicationMarker(f.stored[0].body)?.identity).toEqual(parsePublicationMarker(warning)?.identity);
    expect(f.comments.listIssueComments).toHaveBeenCalledTimes(1); expect(f.freshness.matches).toHaveBeenCalledTimes(2);
  });
  it('is idempotent on replay without another update', async () => {
    const f = fixture(); await f.useCase.invoke(context); const [result] = await f.useCase.invoke(context);
    expect(f.comments.updateComment).toHaveBeenCalledTimes(1); expect(result.executed).toBe(false);
  });
  it('retires an aligned card without repeating its old Git alignment assertion', async () => {
    const f = fixture(buildAlignedBranchSyncComment(dependency, catalog)); await f.useCase.invoke(context);
    expect(f.stored[0].body).not.toContain('now contains');
  });
  it('creates no comment when a closed issue has no owned card', async () => {
    const f = fixture(); f.stored.length = 0; const [result] = await f.useCase.invoke(context);
    expect(f.comments.updateComment).not.toHaveBeenCalled(); expect(result.executed).toBe(false);
  });
  it.each(['human', 'foreign', 'malformed', 'other-topic', 'other-issue', 'unknown-source', 'unsafe-id'])(
    'leaves %s comments unchanged', async kind => {
      const f = fixture();
      if (kind === 'human' || kind === 'foreign') f.stored[0].user.login = kind;
      if (kind === 'malformed') f.stored[0].body = warning.replace('schema="1"', 'schema="99"');
      if (kind === 'other-topic') f.stored[0].body = warning.replace('topic="branch-sync"', 'topic="progress"');
      if (kind === 'other-issue') f.stored[0].body = warning.replace('target="issue:42"', 'target="issue:43"');
      if (kind === 'unknown-source') f.stored[0].body = warning.replace(/source="[^"]+"/u, 'source="future:unknown"');
      if (kind === 'unsafe-id') f.stored[0].id = 0;
      await f.useCase.invoke(context); expect(f.comments.updateComment).not.toHaveBeenCalled();
    },
  );
  it('ignores transition notifications and preserves their historical text', async () => {
    const f = fixture('<!-- copilot:transition schema="1" topic="branch-sync" target="issue:42" --> Historical alert.');
    await f.useCase.invoke(context); expect(f.comments.updateComment).not.toHaveBeenCalled();
  });
  it('leaves reopened work untouched and reports no verified closure', async () => {
    const f = fixture(); f.issues.readIssue.mockResolvedValue({ number: 42, state: 'open', reason: 'reopened', labels: [] });
    const [result] = await f.useCase.invoke(context);
    expect(f.comments.listIssueComments).not.toHaveBeenCalled(); expect(result.payload).not.toHaveProperty('state');
  });
  it('aborts when the issue reopens immediately before the update', async () => {
    const f = fixture(); f.issues.readIssue.mockResolvedValueOnce({ number: 42, state: 'closed', reason: 'completed', labels: [] })
      .mockResolvedValue({ number: 42, state: 'open', reason: 'reopened', labels: [] });
    const [result] = await f.useCase.invoke(context);
    expect(f.comments.updateComment).not.toHaveBeenCalled(); expect(result).toMatchObject({ success: false, payload: { nativeClosed: false } });
  });
  it('aborts when the closure reason changes during publication', async () => {
    const f = fixture(); f.issues.readIssue.mockResolvedValueOnce({ number: 42, state: 'closed', reason: 'completed', labels: [] })
      .mockResolvedValue({ number: 42, state: 'closed', reason: 'duplicate', labels: [] });
    const [result] = await f.useCase.invoke(context); expect(result.success).toBe(false); expect(f.comments.updateComment).not.toHaveBeenCalled();
  });
  it('does not overwrite a card edited since its first read', async () => {
    const f = fixture(); f.comments.listIssueComments.mockResolvedValueOnce([{ ...f.stored[0] }]);
    f.stored[0].body = 'concurrent owner edit'; const [result] = await f.useCase.invoke(context);
    expect(result.success).toBe(false); expect(f.comments.updateComment).not.toHaveBeenCalled();
  });
  it.each(['read', 'comments', 'update'])('sanitizes a denied %s operation and preserves its retained effects', async operation => {
    const f = fixture(); const error = new Error('private provider diagnostic');
    if (operation === 'read') f.issues.readIssue.mockRejectedValue(error);
    if (operation === 'comments') f.comments.listIssueComments.mockRejectedValue(error);
    if (operation === 'update') f.comments.updateComment.mockRejectedValue(error);
    const [result] = await f.useCase.invoke(context); expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('private provider diagnostic');
  });
  it.each([0, Number.NaN])('rejects an unsafe issue identifier (%s) before provider access', async issueNumber => {
    const f = fixture(); await f.useCase.invoke({ ...context, issueNumber }); expect(f.issues.readIssue).not.toHaveBeenCalled();
  });
  it('fails closed for a foreign native issue identity', async () => {
    const f = fixture(); f.issues.readIssue.mockResolvedValue({ number: 43, state: 'closed', reason: 'completed', labels: [] });
    const [result] = await f.useCase.invoke(context); expect(result.success).toBe(false); expect(f.comments.listIssueComments).not.toHaveBeenCalled();
  });
  it('reads the inventory only once when retiring twenty owned cards', async () => {
    const f = fixture(); for (let id = 9; id < 28; id++) f.stored.push({ id, body: warning, user: { login: 'bot' } });
    const [result] = await f.useCase.invoke(context);
    expect(result).toMatchObject({ success: true, payload: { retiredCards: 20 } });
    expect(f.comments.listIssueComments).toHaveBeenCalledTimes(1);
    expect(f.freshness.matches).toHaveBeenCalledTimes(40);
    const witness = f.freshness.matches.mock.calls[0][0];
    expect(witness).toMatchObject({ surface: 'issue-comment', commentId: 8, author: 'bot', target: { kind: 'issue', number: 42 },
      bodyDigest: replyRequestBodyDigest(warning) });
    expect(Object.isFrozen(witness)).toBe(true); expect(Object.isFrozen(witness.target)).toBe(true);
    expect(witness).not.toHaveProperty('body');
  });
  it.each(['changed-or-unavailable', 'provider-error'])('preserves cards when targeted freshness is %s', async kind => {
    const f = fixture();
    if (kind === 'provider-error') f.freshness.matches.mockRejectedValue(new Error('private current-card failure'));
    else f.freshness.matches.mockResolvedValue(false);
    const [result] = await f.useCase.invoke(context);
    expect(result.success).toBe(false); expect(f.comments.updateComment).not.toHaveBeenCalled();
    expect(f.stored[0].body).toBe(warning); expect(JSON.stringify(result)).not.toContain('private current-card failure');
    expect(f.comments.listIssueComments).toHaveBeenCalledTimes(1);
  });
  it('rejects more than twenty owned cards without partial updates', async () => {
    const f = fixture(); for (let id = 9; id < 29; id++) f.stored.push({ id, body: warning, user: { login: 'bot' } });
    const [result] = await f.useCase.invoke(context); expect(result.success).toBe(false); expect(f.comments.updateComment).not.toHaveBeenCalled();
  });
  it('retains the first retired card when a later update fails', async () => {
    const f = fixture(); f.stored.push({ id: 9, body: warning, user: { login: 'bot' } });
    f.comments.updateComment.mockImplementationOnce(async (_n, id, body) => { f.stored.find(c => c.id === id)!.body = body; })
      .mockRejectedValueOnce(new Error('private second update'));
    const [result] = await f.useCase.invoke(context); expect(result).toMatchObject({ success: false, executed: true, payload: { retiredCards: 1 } });
  });
  it('requires a trusted bot identity before adopting any card', async () => {
    const f = fixture(); await f.useCase.invoke({ ...context, trustedBotLogin: undefined }); expect(f.issues.readIssue).not.toHaveBeenCalled();
  });
});


describe('verified concurrent card retirement (#622)', () => {
  const finalBody = buildRetiredBranchSyncComment(parsePublicationMarker(warning)!.identity, catalog);
  it('adopts an already-retired owned card after its original witness was superseded', async () => {
    const f = fixture(); f.comments.listIssueComments.mockResolvedValueOnce([{ ...f.stored[0] }]);
    f.stored[0].body = finalBody;
    const [result] = await f.useCase.invoke(context);
    expect(result).toMatchObject({ success: true, executed: false, payload: { reconciled: true, outcome: 'already-converged', superseded: true } });
    expect(f.comments.updateComment).not.toHaveBeenCalled();
  });
  it('recovers a failed write response only when exact final body and native closure are verified', async () => {
    const f = fixture(); f.comments.updateComment.mockImplementation(async (_n, _id, body) => {
      f.stored[0].body = body; throw new Error('SECRET transport outcome');
    });
    const [result] = await f.useCase.invoke(context);
    expect(result).toMatchObject({ success: true, payload: { reconciled: true, superseded: true } });
    expect(JSON.stringify(result)).not.toContain('SECRET'); expect(f.stored[0].body).toBe(finalBody);
  });
  it('does not certify an accepted write whose final card is still active', async () => {
    const f = fixture(); f.comments.updateComment.mockResolvedValue(undefined);
    const [result] = await f.useCase.invoke(context);
    expect(result).toMatchObject({ success: false, executed: true, payload: { retiredCards: 1, reconciled: false },
      errors: [{ recovery: { variables: { phase: 'card-verification', state: 'closed', changed: 1, remaining: 1 } } }] });
  });
  it.each(['reopened', 'not_planned'])('refuses a superseded card when native reason becomes %s', async reason => {
    const f = fixture(); f.comments.listIssueComments.mockResolvedValueOnce([{ ...f.stored[0] }]);
    f.stored[0].body = finalBody;
    f.issues.readIssue.mockResolvedValueOnce({ number: 42, state: 'closed', reason: 'completed', labels: ['100%'] })
      .mockResolvedValue({ number: 42, state: reason === 'reopened' ? 'open' : 'closed', reason, labels: [] });
    const [result] = await f.useCase.invoke(context);
    expect(result).toMatchObject({ success: false, payload: { reconciled: false } });
    expect(f.comments.updateComment).not.toHaveBeenCalled();
  });
  it('retains successful card effects when the final native read is unavailable', async () => {
    const f = fixture(); const read = f.issues.readIssue.getMockImplementation()!; let calls = 0;
    f.issues.readIssue.mockImplementation(async () => { if (++calls === 3) throw new Error('SECRET native response'); return read(); });
    const [result] = await f.useCase.invoke(context);
    expect(result).toMatchObject({ success: false, executed: true, payload: { retiredCards: 1 },
      errors: [{ recovery: { variables: { phase: 'native-fence', state: 'unavailable', changed: 1, remaining: 1 } } }] });
    expect(f.stored[0].body).toBe(finalBody); expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('rechecks native closure even when the inventory contains no owned card', async () => {
    const f = fixture(); f.stored.length = 0;
    f.issues.readIssue.mockResolvedValueOnce({ number: 42, state: 'closed', reason: 'completed', labels: [] })
      .mockResolvedValue({ number: 42, state: 'open', reason: 'reopened', labels: [] });
    expect((await f.useCase.invoke(context))[0]).toMatchObject({ success: false, payload: { nativeClosed: false } });
    expect(f.comments.updateComment).not.toHaveBeenCalled();
  });
});


it('bounds diagnostics for an oversized owned-card inventory without mutating it', async () => {
  const f = fixture();
  for (let id = 9; id < 3009; id++) f.stored.push({ id, body: warning, user: { login: 'bot' } });
  const [result] = await f.useCase.invoke(context);
  expect(result).toMatchObject({ success: false, errors: [{ recovery: { variables: { phase: 'card-inventory', remaining: 3000 } } }] });
  expect(f.comments.updateComment).not.toHaveBeenCalled();
});

it('converges a relationship-retired historical card to native issue closure', async () => {
  const f=fixture(buildUnrelatedBranchSyncComment(branchSyncPublicationIdentity(dependency),{...dependency,workingBranch:'new'},catalog));
  const [result]=await f.useCase.invoke(context); expect(result.success).toBe(true);
  expect(parsePublicationMarker(f.stored[0].body)?.sourceVersion).toBe('closed:issue');
});
