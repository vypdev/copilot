import { PreBranchSddGateUseCase, type PreBranchSddContext } from '../../../sdd/pre_branch_sdd_gate_use_case';
import type { SddCatalogSnapshot, SddPreparedDraft } from '../../../../ports/pre_branch_sdd_ports';

const baseSha = 'a'.repeat(40);
const commitSha = 'b'.repeat(40);
const reason = 'The issue changes a product contract that belongs to the payments capability.';
const plan = { action: 'update', path: 'specs/payments.md', capabilityId: 'payments', reason, questions: [] } as const;
const question = { id: 'Q1', text: 'Should existing callers retain the same behavior?', owner: 'maintainer' };
const snapshot: SddCatalogSnapshot = {
  baseSha,
  template: '# Template',
  standard: '# Standard',
  capabilities: [{
    id: 'payments', title: 'Payments', status: 'implemented', scope: 'Payment workflow', owner: 'Maintainers', lastVerified: '2026-09-17',
    specs: ['specs/payments.md'], workflows: [], entrypoints: ['src/index.ts'], code: ['src/index.ts'], tests: ['src/index.test.ts'], documentation: ['docs/payments.mdx'],
  }],
};
const prepared: SddPreparedDraft = { plan, baseSha, markdown: '# Draft', changedPaths: ['specs/payments.md'] };

function context(): PreBranchSddContext {
  return {
    issueNumber: 42, issueTitle: 'Change payments', issueBody: 'The payment flow must change.', issueAuthor: 'alice',
    admittedKind: 'feature', profileDigest: 'profile', baseBranch: 'develop', tokenUser: 'copilot[bot]',
    agentConfiguration: { provider: 'codex', model: 'model' } as never,
  };
}

function harness() {
  let labels = ['feature', 'in-progress'];
  const comments: { id: number; body: string; user: { login: string } }[] = [];
  const query = jest.fn();
  const loadSnapshot = jest.fn().mockResolvedValue(snapshot);
  const readSdd = jest.fn().mockResolvedValue('# Existing SDD');
  const validateDraft = jest.fn().mockResolvedValue(prepared);
  const publish = jest.fn().mockResolvedValue(commitSha);
  const recoverPublished = jest.fn().mockResolvedValue(undefined);
  const verifyPublication = jest.fn().mockResolvedValue(true);
  const addComment = jest.fn(async (_issue: number, body: string) => { comments.push({ id: 100, body, user: { login: 'copilot[bot]' } }); });
  const updateComment = jest.fn(async (_issue: number, id: number, body: string) => {
    const target = comments.find(comment => comment.id === id);
    if (target) target.body = body;
  });
  const setLabels = jest.fn(async (_issue: number, next: readonly string[]) => { labels = [...next]; });
  const isActorAllowedToModifyFiles = jest.fn().mockResolvedValue(true);
  const getDescription = jest.fn().mockResolvedValue('The payment flow must change.');
  const getTitle = jest.fn().mockResolvedValue('Change payments');
  const getLinkedBranch = jest.fn().mockResolvedValue({ name: 'feature/42-change', headSha: baseSha });
  const useCase = new PreBranchSddGateUseCase(
    { query },
    { loadSnapshot, readSdd, validateDraft, publish, recoverPublished, verifyPublication },
    { listIssueComments: jest.fn(async () => comments), addComment, updateComment },
    { getLabels: jest.fn(async () => labels), setLabels },
    { isActorAllowedToModifyFiles },
    { getDescription },
    { getTitle } as never,
    { getLinkedBranch },
  );
  return { useCase, comments, query, loadSnapshot, readSdd, validateDraft, publish, recoverPublished, verifyPublication, addComment, updateComment, setLabels, isActorAllowedToModifyFiles, getDescription, getTitle, getLinkedBranch, labels: () => labels };
}

describe('PreBranchSddGateUseCase', () => {
  it('adds the SDD label and asks blocking questions before any draft or branch', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('waiting');
    expect(h.labels()).toContain('SDD');
    expect(h.addComment).toHaveBeenCalledTimes(1);
    expect(h.comments[0].body).toContain('SDD Q1: your answer');
    expect(h.validateDraft).not.toHaveBeenCalled();
    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it('uses the effective issue locale for the clarification card', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    await h.useCase.begin({ ...context(), issueLocale: 'es-ES' });
    expect(h.comments[0].body).toContain('Estado del SDD');
    expect(h.comments[0].body).toContain('SDD Q1: tu respuesta');
    expect(h.query.mock.calls[0][0].prompt).toContain('es-ES');
  });

  it('ignores a comment by an unauthorized maintainer and remains silent on replay', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    await h.useCase.begin(context());
    h.comments.push({ id: 101, body: 'SDD Q1: Preserve the existing API', user: { login: 'mallory' } });
    h.isActorAllowedToModifyFiles.mockResolvedValue(false);
    const replay = await h.useCase.begin(context());
    expect(replay.status).toBe('waiting');
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.addComment).toHaveBeenCalledTimes(1);
    expect(h.validateDraft).not.toHaveBeenCalled();
  });

  it('drafts only after an authorized answer and validates before returning a branch-ready draft', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    await h.useCase.begin(context());
    h.comments.push({ id: 101, body: 'SDD Q1: Preserve the existing API', user: { login: 'maintainer' } });
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('drafted');
    expect(h.query.mock.calls.map(call => call[0].agentId)).toEqual([
      'pre-branch-sdd-analysis', 'pre-branch-sdd-analysis', 'pre-branch-sdd-draft',
    ]);
    expect(h.validateDraft).toHaveBeenCalledWith(snapshot, expect.objectContaining({ path: plan.path }), '# New SDD content', undefined);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('restarts clarification when the development base changes while answers are pending', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    await h.useCase.begin(context());
    h.comments.push({ id: 101, body: 'SDD Q1: Preserve the existing API', user: { login: 'maintainer' } });
    h.loadSnapshot.mockResolvedValue({ ...snapshot, baseSha: 'd'.repeat(40) });
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('waiting');
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(h.validateDraft).not.toHaveBeenCalled();
  });

  it('publishes on the exact branch, verifies the remote SHA and updates one owned card', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const draft = await h.useCase.begin(context());
    expect(draft.status).toBe('drafted');
    if (draft.status !== 'drafted') throw new Error('expected draft');
    const outcome = await h.useCase.publish(context(), draft, 'feature/42-change');
    expect(outcome).toMatchObject({ status: 'published', branchName: 'feature/42-change', commitSha });
    expect(h.recoverPublished).toHaveBeenCalledWith('feature/42-change', prepared);
    expect(h.publish).toHaveBeenCalledWith('feature/42-change', prepared);
    expect(h.verifyPublication).toHaveBeenCalledWith('feature/42-change', baseSha, commitSha, plan.path);
    expect(h.comments).toHaveLength(1);
    expect(h.comments[0].body).toContain(commitSha);
  });

  it('recovers a pushed first commit after a failed status update without another commit', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('expected draft');
    h.recoverPublished.mockResolvedValue(commitSha);
    const outcome = await h.useCase.publish(context(), draft, 'feature/42-change');
    expect(outcome.status).toBe('published');
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('refuses to publish on a matching remote name that is not linked to this issue', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('expected draft');
    h.getLinkedBranch.mockResolvedValue(undefined);
    const outcome = await h.useCase.publish(context(), draft, 'feature/42-change');
    expect(outcome.status).toBe('blocked');
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('blocks publication after a human title edit but ignores the generated emoji prefix', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('expected draft');
    h.getTitle.mockResolvedValue('🧑‍💻 - Change payments');
    expect((await h.useCase.publish(context(), draft, 'feature/42-change')).status).toBe('published');
    h.getTitle.mockResolvedValue('🧑‍💻 - Change refunds');
    expect((await h.useCase.publish(context(), draft, 'feature/42-change')).status).toBe('blocked');
  });

  it('revises the owning SDD on the retained branch after a material issue change', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# First contract' });
    const first = await h.useCase.begin(context());
    if (first.status !== 'drafted') throw new Error('expected first draft');
    await h.useCase.publish(context(), first, 'feature/42-change');

    const revisedContext = { ...context(), issueBody: 'The payment flow must change and preserve old clients.' };
    h.loadSnapshot.mockImplementation(async (branch: string) => branch === 'feature/42-change'
      ? { ...snapshot, baseSha: commitSha }
      : snapshot);
    h.getLinkedBranch.mockResolvedValue({ name: 'feature/42-change', headSha: commitSha });
    h.getDescription.mockResolvedValue(revisedContext.issueBody);
    h.validateDraft.mockResolvedValue({ ...prepared, baseSha: commitSha, markdown: '# Revised contract' });
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# Revised contract' });
    const revision = await h.useCase.begin(revisedContext);
    expect(revision.status).toBe('drafted');
    if (revision.status !== 'drafted') throw new Error('expected revision draft');
    expect(revision.record).toMatchObject({ branchName: 'feature/42-change', commitSha });
    const revisionSha = 'c'.repeat(40);
    h.publish.mockResolvedValueOnce(revisionSha);
    const published = await h.useCase.publish(revisedContext, revision, 'feature/42-change');
    expect(published).toMatchObject({ status: 'published', commitSha: revisionSha });
    expect(h.comments[0].body).toContain(revisionSha);
    expect(h.comments[0].body).toContain(commitSha);
  });

  it('blocks an invalid owner response before asking questions or drafting', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, path: 'src/outside.md', questions: [], newCapability: null });
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('blocked');
    expect(h.addComment).not.toHaveBeenCalled();
    expect(h.validateDraft).not.toHaveBeenCalled();
  });
});
