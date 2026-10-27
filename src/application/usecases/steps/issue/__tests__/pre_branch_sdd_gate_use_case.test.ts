import { readSddGateRecord, SddDraftFormatFailure } from '../../../../../domain/pre_branch_sdd';
import { PreBranchSddGateUseCase, type PreBranchSddContext } from '../../../sdd/pre_branch_sdd_gate_use_case';
import type { SddCatalogSnapshot, SddPreparedDraft } from '../../../../ports/pre_branch_sdd_ports';

const baseSha = 'a'.repeat(40);
const commitSha = 'b'.repeat(40);
const reason = 'The issue changes a product contract that belongs to the payments capability.';
const plan = { action: 'update', path: 'specs/payments.md', capabilityId: 'payments', reason, questions: [] } as const;
const newPlan = { action: 'new', path: 'specs/invoicing.md', capabilityId: 'invoicing', reason, questions: [] } as const;
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

function harness(presentation?: ConstructorParameters<typeof PreBranchSddGateUseCase>[8]) {
  let labels = ['feature', 'in-progress'];
  const comments: { id: number; body: string; user: { login: string } }[] = [];
  const query = jest.fn();
  const loadSnapshot = jest.fn().mockResolvedValue(snapshot);
  const isAncestor = jest.fn().mockResolvedValue(true);
  const readSdd = jest.fn().mockResolvedValue('# Existing SDD');
  const validateDraft = jest.fn().mockResolvedValue(prepared);
  const publish = jest.fn().mockResolvedValue(commitSha);
  const recoverPublished = jest.fn().mockResolvedValue(undefined);
  const verifyPublication = jest.fn().mockResolvedValue(true);
  const addComment = jest.fn(async (_issue: number, body: string) => { comments.push({ id: Math.max(99, ...comments.map(comment => comment.id)) + 1, body, user: { login: 'copilot[bot]' } }); });
  const updateComment = jest.fn(async (_issue: number, id: number, body: string) => {
    const target = comments.find(comment => comment.id === id);
    if (target) target.body = body;
  });
  const setLabels = jest.fn(async (_issue: number, next: readonly string[]) => { labels = [...next]; });
  const isActorAllowedToModifyFiles = jest.fn().mockResolvedValue(true);
  const isActorAllowedToUseMemberOnlyAutomation = jest.fn().mockResolvedValue(true);
  const getDescription = jest.fn().mockResolvedValue('The payment flow must change.');
  const getTitle = jest.fn().mockResolvedValue('Change payments');
  const getLinkedBranch = jest.fn().mockResolvedValue({ name: 'feature/42-change', headSha: baseSha });
  const useCase = new PreBranchSddGateUseCase(
    { query },
    { loadSnapshot, isAncestor, readSdd, validateDraft, publish, recoverPublished, verifyPublication },
    { listIssueComments: jest.fn(async () => comments), addComment, updateComment },
    { getLabels: jest.fn(async () => labels), setLabels },
    { isActorAllowedToModifyFiles, isActorAllowedToUseMemberOnlyAutomation },
    { getDescription },
    { getTitle } as never,
    { getLinkedBranch },
    presentation,
  );
  return { useCase, comments, query, loadSnapshot, isAncestor, readSdd, validateDraft, publish, recoverPublished, verifyPublication, addComment, updateComment, setLabels, isActorAllowedToModifyFiles, getDescription, getTitle, getLinkedBranch, labels: () => labels };
}

describe('PreBranchSddGateUseCase', () => {
  it('supplies reserved identities from every immutable owner document when drafting a companion', async () => {
    const h = harness();
    h.loadSnapshot.mockResolvedValue({ ...snapshot, capabilities: [{ ...snapshot.capabilities[0], specs: ['specs/payments.md', 'specs/session.md'] }] });
    h.readSdd.mockImplementation(async (_sha, path) => path === 'specs/payments.md' ? 'payments-C01 missing bearer' : 'payments-session-C01 valid session');
    h.query.mockResolvedValueOnce({ ...plan, action: 'companion', path: 'specs/change.md', newCapability: null }).mockResolvedValueOnce({ markdown: '# Draft' });
    expect((await h.useCase.begin(context())).status).toBe('drafted');
    expect(h.readSdd.mock.calls).toEqual([[baseSha, 'specs/payments.md'], [baseSha, 'specs/session.md']]);
    expect(h.query.mock.calls[1][0].prompt).toContain('["payments-C01","payments-session-C01"]');
  });

  it('blocks before drafting when a companion baseline cannot be read', async () => {
    const h = harness();
    h.readSdd.mockResolvedValue(undefined);
    h.query.mockResolvedValueOnce({ ...plan, action: 'companion', path: 'specs/change.md', newCapability: null });
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.validateDraft).not.toHaveBeenCalled();
  });

  it('blocks oversized owner identity context without truncating or drafting', async () => {
    const h = harness();
    h.readSdd.mockResolvedValue(Array.from({ length: 2500 }, (_, index) => `payments-long-baseline-C${index}`).join('\n'));
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null });
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.validateDraft).not.toHaveBeenCalled();
  });

  it('keeps publication blocked after repeated case inconsistencies', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValue({ markdown: '# Contradictory draft' });
    h.validateDraft.mockRejectedValue(new SddDraftFormatFailure('requirement-mapping', 'Mismatch'));
    const result = await h.useCase.begin(context());
    expect(result.status).toBe('blocked');
    expect(h.validateDraft).toHaveBeenCalledTimes(2);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.labels()).not.toContain('branched');
  });

  it('withholds oversized immutable owner evidence while preserving the owner and bounded drafting instructions', async () => {
    const h = harness();
    const large = { ...snapshot, capabilities: [{ ...snapshot.capabilities[0],
      code: Array.from({ length: 1500 }, (_, index) => `packages/billing/src/Module${index}.kt`),
    }] };
    h.loadSnapshot.mockResolvedValue(large);
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Draft' });
    const result = await h.useCase.begin(context());
    expect(result.status).toBe('drafted');
    const prompt = h.query.mock.calls[1][0].prompt;
    expect(prompt).toContain('owner evidence exceeds the bounded prompt; do not invent paths');
    expect(prompt).not.toContain('packages/billing/src/Module');
    expect(prompt).toContain('"capabilityId":"payments"');
    expect(prompt).toContain('Preserve the consumer repository layout and language conventions');
  });

  it('supplies a canonical issue URL and the validated immutable owner evidence when drafting a companion', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, action: 'companion', path: 'specs/payment-status.md', newCapability: null })
      .mockResolvedValueOnce({ markdown: '# Draft companion' });
    await h.useCase.begin({ ...context(), issueUrl: 'https://github.com/vypdev/copilot/issues/42' });
    expect(h.query.mock.calls[0][0].prompt).toContain('Canonical issue URL: https://github.com/vypdev/copilot/issues/42');
    expect(h.query.mock.calls[0][0].prompt).toContain('consumer repository layout and language conventions');
    const draft = h.query.mock.calls[1][0].prompt;
    expect(draft).toContain('Preserve the consumer repository layout and language conventions');
    expect(draft).toContain(`Validated owning catalog at ${baseSha}`);
    expect(draft).toContain(JSON.stringify(snapshot.capabilities[0]));
    expect(draft).toContain('the new companion does not already own itself');
  });

  it.each(['https://github.com/vypdev/copilot/issues/99', 'https://user:password@github.com/vypdev/copilot/issues/42?token=secret'])(
    'does not inject an unverified or credential-bearing issue URL: %s', async issueUrl => {
      const h = harness();
      h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Draft' });
      await h.useCase.begin({ ...context(), issueUrl });
      for (const [request] of h.query.mock.calls) {
        expect(request.prompt).toContain('Canonical issue URL: (unavailable; do not invent');
        expect(request.prompt).not.toContain(issueUrl);
      }
    });
  async function twoClarificationRounds(owner = 'issue-author') {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    await h.useCase.begin(context());
    h.comments.push({ id: 101, body: 'SDD Q1: Preserve strict authorization for existing callers', user: { login: 'maintainer' } });
    h.query.mockResolvedValueOnce({ ...plan, questions: [{ id: 'Q1', text: 'Which chronology should the report use?', owner }], newCapability: null });
    await h.useCase.begin(context());
    return h;
  }

  async function thirdClarificationRound() {
    const h = await twoClarificationRounds();
    h.comments.push({ id: 102, body: 'SDD Q1: Show newest operations first', user: { login: 'alice' } });
    h.query.mockResolvedValueOnce({ ...plan, questions: [{ ...question, text: 'How should stale state be reported?', owner: 'issue-author' }], newCapability: null });
    await h.useCase.begin(context());
    h.comments.push({ id: 103, body: 'SDD Q1: Report stale before pending revision', user: { login: 'alice' } });
    return h;
  }

  it('allows publication preparation after the third question round is fully answered', async () => {
    const h = await thirdClarificationRound();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Accepted draft' });
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('drafted');
    if (outcome.status === 'drafted') {
      expect(outcome.record.round).toBe(3);
      expect(outcome.record.answers).toHaveLength(3);
      expect(outcome.record.answers!.map(answer => answer.round)).toEqual([1, 2, 3]);
    }
    expect(h.validateDraft).toHaveBeenCalledTimes(1);
  });

  it('still blocks a fourth set of questions before drafting or publication', async () => {
    const h = await thirdClarificationRound();
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.validateDraft).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
    expect(readSddGateRecord(h.comments[0].body, 42)!.round).toBe(3);
  });

  it('revalidates a repaired format with the same owner before the final freshness fence', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null })
      .mockResolvedValueOnce({ markdown: '# Invalid draft' }).mockResolvedValueOnce({ markdown: '# Accepted draft' });
    h.validateDraft.mockRejectedValueOnce(new SddDraftFormatFailure('required-heading', 'Missing heading'));
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('drafted');
    expect(h.validateDraft.mock.calls.map(call => call.slice(1, 3))).toEqual([[plan, '# Invalid draft'], [plan, '# Accepted draft']]);
    expect(h.loadSnapshot).toHaveBeenCalledTimes(2);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('refuses a writer that returns no validated draft', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Candidate draft' });
    h.validateDraft.mockResolvedValue(undefined);
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('retains earlier decisions with their round and question when Q IDs are reused', async () => {
    const h = await twoClarificationRounds();
    h.comments.push({ id: 102, body: 'SDD Q1: Show newest operations first', user: { login: 'alice' } });
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Complete draft' });
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('drafted');
    if (outcome.status !== 'drafted') throw new Error('Expected draft');
    expect(outcome.record.answers).toEqual([
      expect.objectContaining({ round: 1, questionId: 'Q1', questionText: question.text, text: 'Preserve strict authorization for existing callers' }),
      expect.objectContaining({ round: 2, questionId: 'Q1', questionText: 'Which chronology should the report use?', text: 'Show newest operations first' }),
    ]);
    for (const call of h.query.mock.calls.slice(2)) {
      expect(call[0].prompt).toContain('Preserve strict authorization');
      expect(call[0].prompt).toContain('Show newest operations first');
    }
  });

  it('does not count a retained Q1 answer as satisfying a new round Q1', async () => {
    const h = await twoClarificationRounds();
    h.query.mockClear();
    expect((await h.useCase.begin(context())).status).toBe('waiting');
    expect(h.query).not.toHaveBeenCalled();
    expect(h.validateDraft).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('still requires current maintainer authorization despite approved historical answers', async () => {
    const h = await twoClarificationRounds('maintainer');
    h.comments.push({ id: 102, body: 'SDD Q1: Show newest operations first', user: { login: 'mallory' } });
    h.isActorAllowedToModifyFiles.mockResolvedValue(false);
    h.query.mockClear();
    expect((await h.useCase.begin(context())).status).toBe('waiting');
    expect(h.query).not.toHaveBeenCalled();
    expect(h.validateDraft).not.toHaveBeenCalled();
  });

  it('does not automatically adopt historical answers after the base changes', async () => {
    const h = await twoClarificationRounds();
    h.loadSnapshot.mockResolvedValue({ ...snapshot, baseSha: 'd'.repeat(40) });
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    expect((await h.useCase.begin(context())).status).toBe('waiting');
    expect(h.query.mock.calls[2][0].prompt).not.toContain('Preserve strict authorization');
    expect(readSddGateRecord(h.comments[0].body, 42)?.answers).toEqual([]);
  });

  it('validates a regenerated bounded draft before any publication', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null })
      .mockResolvedValueOnce({ markdown: 'x'.repeat(18001) })
      .mockResolvedValueOnce({ markdown: '# Regenerated draft' });
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('drafted');
    expect(h.query).toHaveBeenCalledTimes(3);
    expect(h.validateDraft).toHaveBeenCalledTimes(1);
    expect(h.validateDraft).toHaveBeenCalledWith(snapshot, plan, '# Regenerated draft', undefined);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('rejects a changed base after size repair without publishing the regenerated draft', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null })
      .mockResolvedValueOnce({ markdown: 'x'.repeat(18001) })
      .mockResolvedValueOnce({ markdown: '# Regenerated draft' });
    h.loadSnapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, baseSha: 'c'.repeat(40) });
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.validateDraft).toHaveBeenCalledTimes(1);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.addComment).not.toHaveBeenCalled();
  });

  it('retries a pending publication without consuming another clarification round or changing the owner', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Draft' });
    const first = await h.useCase.begin(context());
    if (first.status !== 'drafted') throw new Error('Expected draft');
    h.publish.mockRejectedValueOnce(new Error('Hook failure'));
    await h.useCase.publish(context(), { ...first, record: { ...first.record, round: 3 } }, 'feature/42-change');
    h.query.mockClear();
    h.query.mockResolvedValueOnce({ markdown: '# Retried appendix' });

    const retry = await h.useCase.begin(context());

    expect(retry.status).toBe('drafted');
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.query.mock.calls[0][0].agentId).toBe('pre-branch-sdd-draft');
    if (retry.status === 'drafted') expect(retry.record).toMatchObject({ round: 3, plan, branchName: 'feature/42-change' });
  });

  it('retains the original empty linked branch base when develop advances during recovery', async () => {
    const h = harness();
    const parentSha = 'c'.repeat(40);
    h.loadSnapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, baseSha: parentSha });
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Draft' });
    const outcome = await h.useCase.begin({ ...context(), workingBranch: 'feature/42-change' });
    expect(outcome.status).toBe('drafted');
    expect(h.loadSnapshot).toHaveBeenCalledWith('feature/42-change');
    expect(h.isAncestor).toHaveBeenCalledWith(baseSha, parentSha);
    if (outcome.status === 'drafted') expect(outcome.record.branchName).toBe('feature/42-change');
  });

  it('blocks a retained branch with implementation commits before the SDD', async () => {
    const h = harness();
    h.isAncestor.mockResolvedValue(false);
    expect((await h.useCase.begin({ ...context(), workingBranch: 'feature/42-change' })).status).toBe('blocked');
    expect(h.query).not.toHaveBeenCalled();
  });

  it('ignores Action-owned configuration changes when checking issue freshness', async () => {
    const h = harness();
    h.getDescription.mockResolvedValue(context().issueBody + '\n\n<!-- copilot-configuration-start\n{"workingBranch":"feature/42-change"}\ncopilot-configuration-end -->');
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Draft' });
    expect((await h.useCase.begin(context())).status).toBe('drafted');
  });

  it('persists a bot-owned pending branch record after a publication failure', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Draft' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('Expected validated draft');
    h.publish.mockRejectedValue(new Error('push unavailable'));
    expect((await h.useCase.publish(context(), draft, 'feature/42-change')).status).toBe('blocked');
    expect(readSddGateRecord(h.comments[0].body, 42)).toMatchObject({ phase: 'awaiting-answer', branchName: 'feature/42-change', baseSha });
    expect(h.comments[0].body).toContain('Implementation remains blocked');
  });

  it('recovers a verified first SDD commit after its card publication was interrupted', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValueOnce({ markdown: '# Draft' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('Expected validated draft');
    h.publish.mockRejectedValueOnce(new Error('transport failed after push'));
    await h.useCase.publish(context(), draft, 'feature/42-change');
    h.query.mockClear();
    h.loadSnapshot.mockResolvedValue({ ...snapshot, baseSha: commitSha });
    h.recoverPublished.mockResolvedValue(commitSha);
    const recovered = await h.useCase.begin(context());
    expect(recovered.status).toBe('published');
    expect(h.query).not.toHaveBeenCalled();
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  it('reuses a pending branch question card without dropping ownership on replay', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    const retainedContext = { ...context(), workingBranch: 'feature/42-change' };
    await h.useCase.begin(retainedContext);
    expect((await h.useCase.begin(retainedContext)).status).toBe('waiting');
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(readSddGateRecord(h.comments[0].body, 42)?.branchName).toBe('feature/42-change');
  });

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

  it('accepts an issue-author answer only from the issue author', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [{ ...question, owner: 'issue-author' }], newCapability: null });
    await h.useCase.begin(context());
    h.comments.push({ id: 101, body: 'SDD Q1: Keep old callers working', user: { login: 'maintainer' } });
    expect((await h.useCase.begin(context())).status).toBe('waiting');
    h.comments.push({ id: 102, body: 'SDD Q1: Keep old callers working', user: { login: 'alice' } });
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    expect((await h.useCase.begin(context())).status).toBe('drafted');
    expect(h.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
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

  it('validates the proposed catalog owner before drafting a new capability', async () => {
    const h = harness();
    const newCapability = {
      ...snapshot.capabilities[0], id: 'invoicing', title: 'Invoicing', status: 'proposed',
      scope: 'Invoice behavior', specs: [newPlan.path],
    };
    h.query.mockResolvedValueOnce({ ...newPlan, newCapability });
    h.query.mockResolvedValueOnce({ markdown: '# Invoice contract' });
    expect((await h.useCase.begin(context())).status).toBe('drafted');
    expect(h.validateDraft).toHaveBeenCalledWith(snapshot, newPlan, '# Invoice contract', newCapability);
  });

  it.each([
    ['missing proposed owner', null],
    ['wrong owner ID', { ...snapshot.capabilities[0], id: 'payments', status: 'proposed', specs: [newPlan.path] }],
    ['missing tests', { ...snapshot.capabilities[0], id: 'invoicing', status: 'proposed', specs: [newPlan.path], tests: [] }],
    ['invalid path type', { ...snapshot.capabilities[0], id: 'invoicing', status: 'proposed', specs: [newPlan.path], code: [42] }],
  ])('blocks a new capability with %s', async (_reason, newCapability) => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...newPlan, newCapability });
    h.query.mockResolvedValueOnce({ markdown: '# Invoice contract' });
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.validateDraft).not.toHaveBeenCalled();
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

  it('reuses a verified published SDD without another agent call or timeline card', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const first = await h.useCase.begin(context());
    if (first.status !== 'drafted') throw new Error('expected draft');
    await h.useCase.publish(context(), first, 'feature/42-change');

    const replay = await h.useCase.begin(context());
    expect(replay).toMatchObject({ status: 'published', branchName: 'feature/42-change', commitSha });
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(h.addComment).toHaveBeenCalledTimes(1);
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  it('blocks replay when the published SDD commit is no longer on the linked remote branch', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const first = await h.useCase.begin(context());
    if (first.status !== 'drafted') throw new Error('expected draft');
    await h.useCase.publish(context(), first, 'feature/42-change');
    h.verifyPublication.mockResolvedValue(false);

    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.query).toHaveBeenCalledTimes(2);
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

  it('blocks a changed branch head before publishing and keeps the first commit untouched', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const first = await h.useCase.begin(context());
    if (first.status !== 'drafted') throw new Error('expected draft');
    h.getLinkedBranch.mockResolvedValue({ name: 'feature/42-change', headSha: 'd'.repeat(40) });

    expect((await h.useCase.publish(context(), first, 'feature/42-change')).status).toBe('blocked');
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('blocks a stale issue body before publication', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const first = await h.useCase.begin(context());
    if (first.status !== 'drafted') throw new Error('expected draft');
    h.getDescription.mockResolvedValue('The payment flow changed again.');

    expect((await h.useCase.publish(context(), first, 'feature/42-change')).status).toBe('blocked');
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('blocks when remote verification fails after a pushed commit', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const first = await h.useCase.begin(context());
    if (first.status !== 'drafted') throw new Error('expected draft');
    h.verifyPublication.mockResolvedValue(false);

    expect((await h.useCase.publish(context(), first, 'feature/42-change')).status).toBe('blocked');
    expect(h.comments[0].body).toContain('First SDD publication is pending.');
  });

  it('blocks when branch linkage disappears after the SDD commit is pushed', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.query.mockResolvedValueOnce({ markdown: '# New SDD content' });
    const first = await h.useCase.begin(context());
    if (first.status !== 'drafted') throw new Error('expected draft');
    h.getLinkedBranch.mockResolvedValueOnce({ name: 'feature/42-change', headSha: baseSha });
    h.getLinkedBranch.mockResolvedValueOnce(undefined);
    expect((await h.useCase.publish(context(), first, 'feature/42-change')).status).toBe('blocked');
    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.comments[0].body).toContain('First SDD publication is pending.');
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
    h.verifyPublication.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await h.useCase.begin(revisedContext)).status).toBe('blocked');
  });

  it('blocks an invalid owner response before asking questions or drafting', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, path: 'src/outside.md', questions: [], newCapability: null });
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('blocked');
    expect(h.addComment).toHaveBeenCalledTimes(1);
    expect(h.comments[0].body).toContain('Specific table facts are unavailable');
    expect(readSddGateRecord(h.comments[0].body, 42)).toBeUndefined();
    expect(h.validateDraft).not.toHaveBeenCalled();
  });

  it('blocks a missing catalogued SDD before the drafting call', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [], newCapability: null });
    h.readSdd.mockResolvedValue(undefined);
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.validateDraft).not.toHaveBeenCalled();
  });

  it('requires a known bot identity and a configured drafting agent', async () => {
    const h = harness();
    expect((await h.useCase.begin({ ...context(), tokenUser: '' })).status).toBe('blocked');
    expect((await h.useCase.begin({ ...context(), agentConfiguration: undefined })).status).toBe('blocked');
    expect(h.query).not.toHaveBeenCalled();
  });
});


describe('safe ownership diagnostics (#636)', () => {
  const invalid = [
    ['update-owner-mismatch', { ...plan, path: 'specs/private-update.md' }],
    ['companion-owner-unknown', { ...plan, action: 'companion', capabilityId: 'private-owner', path: 'specs/private-companion.md' }],
    ['companion-path-registered', { ...plan, action: 'companion' }],
    ['new-owner-registered', { ...plan, action: 'new', path: 'specs/private-new.md' }],
    ['new-path-registered', { ...plan, action: 'new', capabilityId: 'private-owner' }],
  ] as const;
  it.each(invalid.flatMap(([code, decision]) => ['en-US', 'es-ES'].map(locale => ({ code, decision, locale }))))(
    'blocks $code in $locale without exposing generated data or publishing a draft', async ({ code, decision, locale }) => {
      const h = harness();
      h.query.mockResolvedValue({ ...decision, reason: 'secret-provider-data '.repeat(4) });
      const outcome = await h.useCase.begin({ ...context(), issueLocale: locale });
      expect(outcome.status).toBe('blocked');
      expect(h.query).toHaveBeenCalledTimes(1);
      expect(h.readSdd).not.toHaveBeenCalled();
      expect(h.validateDraft).not.toHaveBeenCalled();
      expect(h.publish).not.toHaveBeenCalled();
      expect(h.labels()).not.toContain('branched');
      const body = h.comments[0].body;
      expect(body).toContain(code);
      expect(body).not.toMatch(/private-|secret-provider-data/);
      expect(readSddGateRecord(body, 42)).toBeUndefined();
      expect(outcome.results[0].errors[0]).toMatchObject({ code: 'provider.contract-invalid' });
    },
  );
  it('reuses the owned diagnostic on retry and marks recovery without granting readiness', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce(invalid[1][1]).mockResolvedValueOnce(invalid[2][1]);
    await h.useCase.begin(context());
    await h.useCase.begin(context());
    expect(h.addComment).toHaveBeenCalledTimes(1);
    expect(h.updateComment).toHaveBeenCalledTimes(1);
    h.query.mockResolvedValueOnce(plan).mockResolvedValueOnce({ markdown: '# Valid' });
    expect((await h.useCase.begin(context())).status).toBe('drafted');
    expect(h.comments[0].body).toContain('validated ownership');
    expect(h.labels()).not.toContain('branched');
  });
  it('does not overwrite a foreign diagnostic marker', async () => {
    const h = harness();
    h.comments.push({ id: 99, body: '<!-- copilot:sdd-analysis-status:v1 issue="42" -->', user: { login: 'attacker' } });
    h.query.mockResolvedValue(invalid[1][1]);
    await h.useCase.begin(context());
    expect(h.updateComment).not.toHaveBeenCalled();
    expect(h.addComment).toHaveBeenCalledTimes(1);
  });
  it('does not classify an unrelated provider failure as rejected ownership or retry it', async () => {
    const h = harness();
    h.query.mockRejectedValue(new Error('Provider unavailable'));
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.addComment).toHaveBeenCalledTimes(1);
    expect(h.comments[0].body).toContain('Specific table facts are unavailable');
    expect(readSddGateRecord(h.comments[0].body, 42)).toBeUndefined();
  });
  it('withholds all publication when diagnostic publication itself fails', async () => {
    const h = harness();
    h.query.mockResolvedValue(invalid[1][1]);
    h.addComment.mockRejectedValue(new Error('Comment unavailable'));
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.validateDraft).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });
});


it('keeps repeated identical ownership failures to one unchanged diagnostic card', async () => {
  const h = harness();
  h.query.mockResolvedValue({ ...plan, action: 'companion', capabilityId: 'unknown' });
  await h.useCase.begin(context());
  await h.useCase.begin(context());
  expect(h.addComment).toHaveBeenCalledTimes(1);
  expect(h.updateComment).not.toHaveBeenCalled();
});

it('reports a later valid ownership analysis in Spanish without a readiness record', async () => {
  const h = harness();
  h.query.mockResolvedValueOnce({ ...plan, action: 'companion', capabilityId: 'unknown' });
  await h.useCase.begin({ ...context(), issueLocale: 'es-ES' });
  h.query.mockResolvedValueOnce(plan).mockResolvedValueOnce({ markdown: '# Valid' });
  await h.useCase.begin({ ...context(), issueLocale: 'es-ES' });
  expect(h.comments[0].body).toContain('ha validado la propiedad');
  expect(readSddGateRecord(h.comments[0].body, 42)).toBeUndefined();
});

it('keeps malformed analysis outside ownership recovery and publishes only a safe operational card', async () => {
  const h = harness();
  h.query.mockResolvedValue({ ...plan, reason: 'short' });
  expect((await h.useCase.begin(context())).status).toBe('blocked');
  expect(h.query).toHaveBeenCalledTimes(1);
  expect(h.addComment).toHaveBeenCalledTimes(1);
    expect(h.comments[0].body).toContain('Specific table facts are unavailable');
    expect(readSddGateRecord(h.comments[0].body, 42)).toBeUndefined();
  expect(h.validateDraft).not.toHaveBeenCalled();
  expect(h.publish).not.toHaveBeenCalled();
});


describe('blocked SDD diagnostics regression (#714)', () => {
  it('publishes a safe actionable failure card after the single repair is exhausted', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValue({ markdown: '# PRIVATE_CANDIDATE' });
    h.validateDraft.mockRejectedValue(new SddDraftFormatFailure('requirement-mapping', 'PRIVATE_VALIDATION_TEXT'));
    const outcome = await h.useCase.begin(context());
    expect(outcome.status).toBe('blocked');
    expect(h.validateDraft).toHaveBeenCalledTimes(2);
    const card = h.comments.map(comment => comment.body).join('\n');
    expect(card).toContain('Specification preparation is blocked');
    expect(card).toContain('Validation diagnostics');
    expect(card).toContain('requirement-mapping');
    expect(card).not.toMatch(/PRIVATE_CANDIDATE|PRIVATE_VALIDATION_TEXT/u);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.labels()).not.toContain('branched');
  });

  it('updates one owned blocked card on a retry instead of leaving only operator logs', async () => {
    const h = harness();
    h.query.mockImplementation(async request => request.agentId === 'pre-branch-sdd-analysis'
      ? { ...plan, newCapability: null } : { markdown: '# PRIVATE_CANDIDATE' });
    h.validateDraft.mockRejectedValue(new SddDraftFormatFailure('case-identity', 'PRIVATE_VALIDATION_TEXT'));
    await h.useCase.begin(context());
    await h.useCase.begin(context());
    expect(h.comments).toHaveLength(1);
    expect(h.comments[0].body).toContain('case-identity');
    expect(h.validateDraft).toHaveBeenCalledTimes(4);
    expect(h.publish).not.toHaveBeenCalled();
  });
});


describe('SDD diagnostic retention and recovery (#714)', () => {
  const failDraft = (h: ReturnType<typeof harness>) => {
    h.query.mockImplementation(async request => request.agentId === 'pre-branch-sdd-analysis'
      ? { ...plan, newCapability: null } : { markdown: '# PRIVATE_CANDIDATE' });
    h.validateDraft.mockRejectedValue(new SddDraftFormatFailure('case-identity', 'PRIVATE_VALIDATION_TEXT', {
      reason: 'case-identity', phase: 'validation', facts: [{ detail: 'case-reserved', section: 14, expected: 0, observed: 1 }],
    }));
  };

  it('preserves numbered answers and immutable owner context across failed draft retries', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    await h.useCase.begin(context());
    h.comments.push({ id: 101, body: 'SDD Q1: Preserve existing API behavior.', user: { login: 'alice' } });
    failDraft(h);
    await h.useCase.begin(context());
    await h.useCase.begin(context());
    expect(h.comments.find(comment => comment.id === 101)?.body).toBe('SDD Q1: Preserve existing API behavior.');
    expect(h.comments.filter(comment => comment.body.includes('copilot:sdd-analysis-status:v1'))).toHaveLength(1);
    expect(h.query.mock.calls.filter(([request]) => request.agentId === 'pre-branch-sdd-analysis').slice(1)
      .every(([request]) => request.prompt.includes('Preserve existing API behavior.'))).toBe(true);
    expect(h.query.mock.calls.filter(([request]) => request.agentId === 'pre-branch-sdd-draft')).toHaveLength(4);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.comments.filter(comment => comment.body.includes('copilot:sdd-analysis-status:v1'))[0].body)
      .not.toContain('Preserve existing API behavior.');
  });

  it('replaces the blocked view after a verified retry without granting readiness from a diagnostic', async () => {
    const h = harness(); failDraft(h); await h.useCase.begin(context());
    h.validateDraft.mockResolvedValue(prepared);
    const draft = await h.useCase.begin(context());
    expect(draft.status).toBe('drafted');
    if (draft.status !== 'drafted') throw new Error('Expected validated draft');
    const result = await h.useCase.publish(context(), draft, 'feature/42-change');
    expect(result.status).toBe('published');
    const cards = h.comments.filter(comment => comment.body.includes('copilot:sdd-analysis-status:v1'));
    expect(cards).toHaveLength(1);
    expect(cards[0].body).toContain('publication was verified');
    expect(cards[0].body).not.toContain('is blocked');
    expect(readSddGateRecord(cards[0].body, 42)).toBeUndefined();
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  it('reports a partial publication without claiming the linked branch disappeared', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValue({ markdown: '# Draft' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('Expected validated draft');
    h.publish.mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR'));
    const result = await h.useCase.publish(context(), draft, 'feature/42-change');
    expect(result.status).toBe('blocked');
    const card = h.comments.find(comment => comment.body.includes('copilot:sdd-analysis-status:v1'))!.body;
    expect(card).toContain('publication needs recovery');
    expect(card).toContain('linked branch or commit may already exist');
    expect(card).not.toMatch(/PRIVATE_PROVIDER_ERROR|No new specification or branch was published/u);
    const record = h.comments.map(comment => readSddGateRecord(comment.body, 42)).find(Boolean)!;
    expect(record).toMatchObject({ branchName: 'feature/42-change', phase: 'awaiting-answer' });
  });

  it('retains verified publication when refreshing a prior failure card fails', async () => {
    const h = harness(); failDraft(h); await h.useCase.begin(context());
    h.validateDraft.mockResolvedValue(prepared);
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('Expected validated draft');
    const update = h.updateComment.getMockImplementation()!;
    h.updateComment.mockRejectedValue(new Error('PRIVATE_PROVIDER_ERROR'));
    const result = await h.useCase.publish(context(), draft, 'feature/42-change');
    expect(result.status).toBe('published');
    expect(result.results).toEqual(expect.arrayContaining([expect.objectContaining({ success: false,
      errors: [expect.objectContaining({ code: 'provider.unavailable' })] })]));
    expect(h.comments.map(comment => readSddGateRecord(comment.body, 42)).find(Boolean))
      .toMatchObject({ phase: 'published', commitSha });
    h.updateComment.mockImplementation(update);
    h.query.mockClear(); h.validateDraft.mockClear();
    expect((await h.useCase.begin(context())).status).toBe('published');
    expect(h.query).not.toHaveBeenCalled();
    expect(h.validateDraft).not.toHaveBeenCalled();
    expect(h.comments.find(comment => comment.body.includes('copilot:sdd-analysis-status:v1'))?.body)
      .toContain('publication was verified');

  });

  it('keeps blocked status and the original error if the diagnostic cannot be published', async () => {
    const h = harness(); failDraft(h);
    h.addComment.mockRejectedValue(new Error('PRIVATE_PUBLICATION_ERROR'));
    const result = await h.useCase.begin(context());
    expect(result.status).toBe('blocked');
    expect(result.results).toHaveLength(2);
    expect(result.results[0].errors[0].recovery?.id).toBe('sdd-draft-case-identity-invalid');
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.comments).toHaveLength(0);
  });

  it('withholds stale candidate diagnostics after the issue changes', async () => {
    const h = harness(); failDraft(h);
    h.getDescription.mockResolvedValue('New issue input');
    const result = await h.useCase.begin(context());
    expect(result.status).toBe('blocked');
    expect(result.results.flatMap(result => result.errors)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'workflow.stale' }),
    ]));
    expect(h.addComment).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it.each(['body', 'title', 'base'] as const)('preserves the current cards when publication starts from a stale %s', async changed => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValue({ markdown: '# Draft' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('Expected validated draft');
    const current = '<!-- copilot:sdd-analysis-status:v1 issue="42" --> Current run';
    h.comments.push({ id: 900, body: current, user: { login: 'copilot[bot]' } });
    if (changed === 'body') h.getDescription.mockResolvedValue('Updated issue body');
    if (changed === 'title') h.getTitle.mockResolvedValue('Updated issue title');
    if (changed === 'base') h.loadSnapshot.mockResolvedValue({ ...snapshot, baseSha: 'd'.repeat(40) });
    h.addComment.mockClear(); h.updateComment.mockClear();
    const result = await h.useCase.publish(context(), draft, 'feature/42-change');
    expect(result.status).toBe('blocked');
    expect(result.results.flatMap(result => result.errors)).toEqual([expect.objectContaining({ code: 'workflow.stale' })]);
    expect(h.addComment).not.toHaveBeenCalled();
    expect(h.updateComment).not.toHaveBeenCalled();
    expect(h.comments).toEqual([{ id: 900, body: current, user: { login: 'copilot[bot]' } }]);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('rechecks the source before writing either recovery card after a publication failure', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValue({ markdown: '# Draft' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('Expected validated draft');
    const current = '<!-- copilot:sdd-analysis-status:v1 issue="42" --> Current run';
    h.comments.push({ id: 900, body: current, user: { login: 'copilot[bot]' } });
    h.publish.mockImplementation(async () => {
      h.getDescription.mockResolvedValue('Newer human request');
      throw new Error('Interrupted push');
    });
    h.addComment.mockClear(); h.updateComment.mockClear();
    const result = await h.useCase.publish(context(), draft, 'feature/42-change');
    expect(result.status).toBe('blocked');
    expect(result.results.flatMap(result => result.errors)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'workflow.stale' })]));
    expect(h.addComment).not.toHaveBeenCalled();
    expect(h.updateComment).not.toHaveBeenCalled();
    expect(h.comments[0].body).toBe(current);
  });

  it('withholds publication diagnostics if the source changes while localized copy resolves', async () => {
    const resolve = jest.fn();
    const h = harness({ catalogResolver: { resolve } });
    resolve.mockImplementation(async request => {
      h.getTitle.mockResolvedValue('New human title');
      return { requestedLocale: 'fr-FR', resolvedLocale: 'en-US', source: 'fallback',
        fallbackReason: 'dynamic-response-invalid', messages: request.sourceCatalog.messages };
    });
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValue({ markdown: '# Draft' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('Expected validated draft');
    const current = '<!-- copilot:sdd-analysis-status:v1 issue="42" --> Current run';
    h.comments.push({ id: 900, body: current, user: { login: 'copilot[bot]' } });
    h.publish.mockRejectedValue(new Error('Interrupted push'));
    const result = await h.useCase.publish({ ...context(), issueLocale: 'fr-FR' }, draft, 'feature/42-change');
    expect(result.status).toBe('blocked');
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(result.results.flatMap(result => result.errors)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'workflow.stale' })]));
    expect(h.comments.find(comment => comment.id === 900)?.body).toBe(current);
    expect(h.updateComment).not.toHaveBeenCalled();
  });

  it.each([false, true])('guards revision recovery against the actual returned commit (foreign advance: %s)', async foreignAdvance => {
    const h = harness();
    h.query.mockResolvedValueOnce({ ...plan, newCapability: null }).mockResolvedValue({ markdown: '# Draft' });
    const draft = await h.useCase.begin(context());
    if (draft.status !== 'drafted') throw new Error('Expected validated draft');
    const revision = { ...draft, record: { ...draft.record, branchName: 'feature/42-change', commitSha: baseSha } };
    h.publish.mockImplementation(async () => {
      h.loadSnapshot.mockResolvedValue({ ...snapshot, baseSha: foreignAdvance ? 'd'.repeat(40) : commitSha });
      return commitSha;
    });
    h.verifyPublication.mockResolvedValue(false);
    const result = await h.useCase.publish(context(), revision, 'feature/42-change');
    expect(result.status).toBe('blocked');
    if (foreignAdvance) {
      expect(h.comments).toHaveLength(0);
      expect(result.results.flatMap(result => result.errors)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'workflow.stale' })]));
    } else {
      expect(h.comments.find(comment => comment.body.includes('copilot:sdd-analysis-status:v1'))?.body).toContain('publication needs recovery');
      expect(h.comments.map(comment => readSddGateRecord(comment.body, 42)).find(Boolean))
        .toMatchObject({ branchName: 'feature/42-change', phase: 'awaiting-answer', commitSha: baseSha });
      expect(result.results).toHaveLength(1);
    }
  });

  it.each([1, 2])('clears a failed answer check when %i existing question(s) remain incomplete', async count => {
    const h = harness();
    const questions = Array.from({ length: count }, (_, index) => ({ ...question, id: `Q${index + 1}` }));
    h.query.mockResolvedValueOnce({ ...plan, questions, newCapability: null });
    const first = await h.useCase.begin(context());
    expect(first.status).toBe('waiting');
    const original = h.comments[0].body;
    h.comments.push({ id: 101, body: 'SDD Q1: Preserve current behavior.', user: { login: 'bob' } });
    h.isActorAllowedToModifyFiles.mockRejectedValueOnce(new Error('Permission query unavailable'));
    expect((await h.useCase.begin(context())).status).toBe('blocked');
    expect(h.comments.find(comment => comment.body.includes('copilot:sdd-analysis-status:v1'))?.body).toContain('is blocked');
    h.isActorAllowedToModifyFiles.mockResolvedValue(count === 2);
    h.query.mockClear(); h.addComment.mockClear(); h.updateComment.mockClear();
    expect((await h.useCase.begin(context())).status).toBe('waiting');
    expect(h.comments.find(comment => comment.body.includes('copilot:sdd-analysis-status:v1'))?.body).toContain('Waiting for the numbered answers');
    expect(h.comments[0].body).toBe(original);
    expect(h.comments[1].body).toBe('SDD Q1: Preserve current behavior.');
    expect(h.query).not.toHaveBeenCalled(); expect(h.publish).not.toHaveBeenCalled();
    expect(h.updateComment).toHaveBeenCalledTimes(1); expect(h.addComment).not.toHaveBeenCalled();
    expect((await h.useCase.begin(context())).status).toBe('waiting');
    expect(h.updateComment).toHaveBeenCalledTimes(1);
  });

  it.each(['deleted', 'stale'] as const)('does not recreate or overwrite a %s recovery view during localization', async race => {
    const resolve = jest.fn(); const h = harness({ catalogResolver: { resolve } });
    const ctx = { ...context(), issueLocale: 'fr-FR' };
    h.query.mockResolvedValueOnce({ ...plan, questions: [question], newCapability: null });
    await h.useCase.begin(ctx);
    const current = '<!-- copilot:sdd-analysis-status:v1 issue="42" --> Current run';
    h.comments.push({ id: 900, body: current, user: { login: 'copilot[bot]' } });
    resolve.mockImplementation(async request => {
      if (race === 'deleted') h.comments.splice(h.comments.findIndex(comment => comment.id === 900), 1);
      else h.getDescription.mockResolvedValue('Newer issue request');
      return { requestedLocale: 'fr-FR', resolvedLocale: 'en-US', source: 'fallback',
        fallbackReason: 'dynamic-response-invalid', messages: request.sourceCatalog.messages };
    });
    h.addComment.mockClear(); h.updateComment.mockClear();
    const result = await h.useCase.begin(ctx);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(h.addComment).not.toHaveBeenCalled(); expect(h.updateComment).not.toHaveBeenCalled();
    if (race === 'deleted') {
      expect(result.status).toBe('waiting'); expect(h.comments).toHaveLength(1);
    } else {
      expect(result.status).toBe('blocked'); expect(h.comments[1].body).toBe(current);
      expect(result.results[0].errors[0].code).toBe('workflow.stale');
    }
    expect(h.query).toHaveBeenCalledTimes(1); expect(h.publish).not.toHaveBeenCalled();
  });

  it('does not overwrite a human-owned forged draft diagnostic marker', async () => {
    const h = harness(); failDraft(h);
    const forged = '<!-- copilot:sdd-analysis-status:v1 issue="42" --> PRIVATE_HUMAN_TEXT';
    h.comments.push({ id: 99, body: forged, user: { login: 'human' } });
    await h.useCase.begin(context());
    expect(h.comments[0].body).toBe(forged);
    expect(h.addComment).toHaveBeenCalledTimes(1);
    expect(h.updateComment).not.toHaveBeenCalled();
  });

  it('reuses the latest trusted card when historical duplicates and a forged marker coexist', async () => {
    const h = harness(); failDraft(h);
    const marker = '<!-- copilot:sdd-analysis-status:v1 issue="42" -->';
    h.comments.push({ id: 90, body: marker + ' historical', user: { login: 'copilot[bot]' } },
      { id: 95, body: marker + ' current', user: { login: 'copilot[bot]' } },
      { id: 99, body: marker + ' human', user: { login: 'attacker' } });
    await h.useCase.begin(context());
    expect(h.addComment).not.toHaveBeenCalled();
    expect(h.updateComment.mock.calls.every(([, id]) => id === 95)).toBe(true);
    expect(h.comments.find(comment => comment.id === 95)?.body).toContain('case-identity');
    expect(h.comments.find(comment => comment.id === 95)?.body).toContain('reserved by an immutable owning specification');
    expect(h.comments.find(comment => comment.id === 90)?.body).toBe(marker + ' historical');
    expect(h.comments.find(comment => comment.id === 99)?.body).toBe(marker + ' human');
  });

  it('requires a trusted bot identity before publishing diagnostics', async () => {
    const h = harness(); failDraft(h);
    expect((await h.useCase.begin({ ...context(), tokenUser: '' })).status).toBe('blocked');
    expect(h.addComment).not.toHaveBeenCalled();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('falls back as one artifact if its required localization slices disagree', async () => {
    const resolver = { resolve: jest.fn(async request => request.ids[0].startsWith('sddPreparation.') ? {
      requestedLocale: 'fr-FR', resolvedLocale: 'fr-FR', source: 'dynamic',
      messages: Object.fromEntries(Object.entries(request.sourceCatalog.messages).map(([id, text]) => [id, 'FR ' + text])),
    } : { requestedLocale: 'fr-FR', resolvedLocale: 'en-US', source: 'fallback',
      fallbackReason: 'dynamic-response-invalid', messages: request.sourceCatalog.messages }) };
    const h = harness({ catalogResolver: resolver as never }); failDraft(h);
    await h.useCase.begin({ ...context(), issueLocale: 'fr-FR' });
    expect(h.comments[0].body).toContain('Specification preparation is blocked');
    expect(h.comments[0].body).not.toContain('FR ');
    expect(resolver.resolve).toHaveBeenCalledTimes(2);
  });
});
