import { ApplicationError } from '../../../../errors/application_error';
import { createPendingPullRequestLink, attachPendingPullRequestLink, readPendingPullRequestLink } from '../../../../../domain/pull_request_issue_link_state';
import { LinkPullRequestIssueUseCase } from '../link_pull_request_issue_use_case';
import type { LinkPullRequestIssueContext } from '../../../pull_request_workflow_context';

jest.mock('../../../../../utils/logger', () => ({ logInfo: jest.fn(), logError: jest.fn() }));

const mockIsLinked = jest.fn();
const mockGetDetails = jest.fn();
const mockUpdateBaseBranch = jest.fn();
const mockUpdateDescription = jest.fn();
const mockWait = jest.fn();
const identity = { number: 10, state: 'open' as const, repository: 'owner/repo', headRepository: 'owner/repo', headRef: 'bugfix/42-work', headSha: 'a'.repeat(40) };
let linkChecks = 0;
let snapshot: { body: string; baseBranch: string; identity: typeof identity };
function setDetails(value: { body: string; baseBranch: string }) {
  linkChecks = 0;
  snapshot = { ...value, identity: { ...identity } };
  mockGetDetails.mockImplementation(async () => ({ ...snapshot, identity: { ...snapshot.identity } }));
}

function context(overrides: Partial<LinkPullRequestIssueContext> = {}): LinkPullRequestIssueContext {
  return {
    issueNumber: 42,
    pullRequestNumber: 10,
    originalBaseBranch: 'develop',
    defaultBranch: 'main',
    ...overrides,
  };
}

describe('LinkPullRequestIssueUseCase', () => {
  let useCase: LinkPullRequestIssueUseCase;

  beforeEach(() => {
    for (const mock of [mockIsLinked, mockGetDetails, mockUpdateBaseBranch, mockUpdateDescription, mockWait]) mock.mockReset();
    mockIsLinked.mockImplementation(async () => ++linkChecks > 1);
    setDetails({ body: 'Current PR body', baseBranch: 'develop' });
    mockUpdateBaseBranch.mockImplementation(async (_pr, base) => { snapshot.baseBranch = base; });
    mockUpdateDescription.mockImplementation(async (_pr, body) => { snapshot.body = body; });
    mockWait.mockResolvedValue(undefined);
    useCase = new LinkPullRequestIssueUseCase(
      {
        isLinked: mockIsLinked,
        getDetails: mockGetDetails,
        updateBaseBranch: mockUpdateBaseBranch,
        updateDescription: mockUpdateDescription,
      },
      { wait: mockWait },
    );
  });

  it('uses only the bound PR number and restores temporary state in order', async () => {
    const results = await useCase.invoke(context());

    expect(mockGetDetails).toHaveBeenCalledWith(10);
    expect(mockIsLinked).toHaveBeenCalledWith(10, 42);
    expect(mockUpdateDescription).toHaveBeenNthCalledWith(1, 10, expect.stringContaining('Resolves #42'));
    expect(mockUpdateBaseBranch).toHaveBeenNthCalledWith(1, 10, 'main');
    expect(mockWait).toHaveBeenCalledWith(20_000);
    expect(mockUpdateBaseBranch).toHaveBeenNthCalledWith(2, 10, 'develop');
    expect(mockUpdateDescription).toHaveBeenNthCalledWith(2, 10, 'Current PR body');
    expect(results.every((result) => result.success)).toBe(true);
    snapshot.identity.headRepository = 'fork/repo';
    linkChecks = 0;
    expect((await useCase.invoke(context())).every(result => result.success)).toBe(true);
    expect(snapshot.baseBranch).toBe('develop');
  });

  it('does nothing when the exact bound PR is already linked', async () => {
    mockIsLinked.mockResolvedValue(true);
    await expect(useCase.invoke(context())).resolves.toEqual([]);
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('recovers the recorded original base when a newer invocation observes the temporary default target', async () => {
    const marker = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    setDetails({ body: `Original\n\nResolves #42\n\n${marker}`, baseBranch: 'main' });
    mockIsLinked.mockResolvedValue(true);

    await useCase.invoke(context({ originalBaseBranch: 'main' }));

    expect(mockUpdateBaseBranch).toHaveBeenCalledWith(10, 'develop');
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, 'Original');
    expect(mockWait).not.toHaveBeenCalled();
  });

  it.each([
    { issueNumber: -1 },
    { issueNumber: 10 },
  ])('skips without provider I/O when no separate issue exists: %p', async (override) => {
    const results = await useCase.invoke(context(override));

    expect(results[0]).toMatchObject({ success: true, executed: false });
    expect(results[0].steps[0]).toContain('No separate linked issue');
    expect(mockGetDetails).not.toHaveBeenCalled();
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('rejects an invalid PR identity even when no separate issue exists', async () => {
    const results = await useCase.invoke(context({ pullRequestNumber: Number.NaN, issueNumber: -1 }));

    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(results[0].steps[0]).toContain('positive pull-request number');
    expect(mockGetDetails).not.toHaveBeenCalled();
  });

  it('cleans an owned pending operation even when GitHub already reports the link', async () => {
    const pending = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    setDetails({ body: `Original\n\nResolves #42\n\n${pending}`, baseBranch: 'main' });
    mockIsLinked.mockResolvedValue(true);

    const results = await useCase.invoke(context());

    expect(mockWait).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).toHaveBeenCalledWith(10, 'develop');
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, 'Original');
    expect(results.every((result) => result.success)).toBe(true);
  });

  it('retains the exact base and body when the initial authenticated inspection fails', async () => {
    const error = new Error('linkage inspection denied');
    mockIsLinked.mockRejectedValue(error);
    const results = await useCase.invoke(context());
    expect(results).toEqual([expect.objectContaining({ success: false, executed: true })]);
    expect(results[0].errors[0]).toMatchObject({ code: 'provider.unavailable' });
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    expect(mockWait).not.toHaveBeenCalled();
  });

  it('restores the base and retains pending evidence when linkage inspection fails', async () => {
    const pending = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    setDetails({ body: `Original\n\nResolves #42\n\n${pending}`, baseBranch: 'main' });
    mockIsLinked.mockRejectedValue(new Error('inspection failed'));

    const results = await useCase.invoke(context());

    expect(mockWait).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).toHaveBeenCalledWith(10, 'develop');
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
    expect(results.at(-1)?.errors[0].recovery?.id).toBe('pull-request-link-reference-retained');
    setDetails({ body: `Original\n\nResolves #42\n\n${pending}`, baseBranch: 'main' });
    mockIsLinked.mockRejectedValue(new ApplicationError('authorization.denied', 'Link query denied.'));
    const denied = await useCase.invoke(context());
    expect(denied[0].errors[0].code).toBe('authorization.denied');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
  });

  it('does not change an already-default base but still restores the body', async () => {
    setDetails({ body: 'Body', baseBranch: 'main' });
    await useCase.invoke(context({ originalBaseBranch: 'main' }));
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).toHaveBeenCalledTimes(2);
  });

  it('retains an unconfirmed reference when changing the base fails', async () => {
    mockUpdateBaseBranch.mockRejectedValueOnce(new Error('base failed'));
    const results = await useCase.invoke(context());
    expect(results.at(-1)?.success).toBe(false);
    expect(results.at(-1)?.errors[0].recovery?.id).toBe('pull-request-link-reference-retained');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
    setDetails({ body: 'Human', baseBranch: 'develop' });
    mockUpdateBaseBranch.mockImplementation(async () => {});
    const ignoredRetarget = await useCase.invoke(context());
    expect(ignoredRetarget[0].errors[0].code).toBe('workflow.stale');
    expect(snapshot.baseBranch).toBe('develop');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
  });

  it('reports a pre-mutation provider read failure without claiming retained state', async () => {
    mockGetDetails.mockRejectedValue(new Error('details unavailable'));

    const results = await useCase.invoke(context());

    expect(results[0]).toMatchObject({
      success: false,
      executed: true,
      steps: ['Unable to link the pull request to its issue. Inspect the PR base and description before rerunning the workflow.'],
    });
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('reports restored state when the first temporary description write fails', async () => {
    mockUpdateDescription.mockRejectedValueOnce(new Error('description failed'));

    const results = await useCase.invoke(context());

    expect(results.at(-1)?.steps).toEqual([
      'Pull-request issue linkage failed, but the original base and description were restored. Re-run the workflow.',
    ]);
    expect(mockUpdateDescription).toHaveBeenCalledTimes(1);
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockWait).not.toHaveBeenCalled();
    setDetails({ body: 'Human', baseBranch: 'develop' });
    mockUpdateDescription.mockRejectedValueOnce(new ApplicationError('provider.rate-limited', 'Rate limited.'));
    const limited = await useCase.invoke(context());
    expect(limited[0].errors[0].code).toBe('provider.rate-limited');
    expect(snapshot).toMatchObject({ body: 'Human', baseBranch: 'develop' });
  });

  it('restores the base and retains evidence when the observation delay fails', async () => {
    mockWait.mockRejectedValue(new Error('delay failed'));
    const results = await useCase.invoke(context());
    expect(results.at(-1)?.success).toBe(false);
    expect(mockUpdateBaseBranch).toHaveBeenLastCalledWith(10, 'develop');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
  });

  it('retains recovery metadata when base restoration fails', async () => {
    mockUpdateBaseBranch
      .mockImplementationOnce(async (_pr, base) => { snapshot.baseBranch = base; })
      .mockRejectedValueOnce(new Error('restore failed'));
    const results = await useCase.invoke(context());
    expect(results.at(-1)?.success).toBe(false);
    expect(results.at(-1)?.steps[0]).toContain('retained the temporary default base branch');
    expect(results.at(-1)?.errors[0].recovery).toEqual({
      id: 'pull-request-link-base-and-reference-retained',
      variables: {},
    });
    expect(mockUpdateDescription).toHaveBeenCalledTimes(1);
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
  });

  it('reports only a retained temporary issue reference when body restoration fails', async () => {
    mockUpdateDescription
      .mockImplementationOnce(async (_pr, body) => { snapshot.body = body; })
      .mockRejectedValueOnce(new Error('restore failed'));
    const results = await useCase.invoke(context());
    expect(results.at(-1)?.steps).toEqual([
      'Pull-request issue linkage failed and retained the temporary issue reference in the description. Re-run the current PR workflow to recover pending state; inspect ownership if recovery remains blocked.',
    ]);
    expect(results.at(-1)?.errors[0].recovery).toEqual({
      id: 'pull-request-link-reference-retained',
      variables: {},
    });
    expect(mockUpdateBaseBranch).toHaveBeenLastCalledWith(10, 'develop');
  });

  it('reports both retained temporary states when neither restoration succeeds', async () => {
    mockUpdateBaseBranch
      .mockImplementationOnce(async (_pr, base) => { snapshot.baseBranch = base; })
      .mockRejectedValueOnce(new Error('base restore failed'));
    mockUpdateDescription
      .mockImplementationOnce(async (_pr, body) => { snapshot.body = body; })
      .mockRejectedValueOnce(new Error('description restore failed'));

    const results = await useCase.invoke(context());

    expect(results.at(-1)?.errors[0].recovery).toEqual({
      id: 'pull-request-link-base-and-reference-retained',
      variables: {},
    });
  });

  it('resumes an exact pending marker without layering another reference', async () => {
    const pending = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    setDetails({ body: `Current PR body\n\nResolves #42\n\n${pending}`, baseBranch: 'main' });
    await useCase.invoke(context());
    expect(mockUpdateDescription).toHaveBeenCalledTimes(1);
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, 'Current PR body');
  });

  it('blocks recovery when an owned pending operation has an unexpected current base', async () => {
    const pending = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    setDetails({
      body: `Current PR body\n\nResolves #42\n\n${pending}`,
      baseBranch: 'release/2.0',
    });

    const results = await useCase.invoke(context());

    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].errors[0].code).toBe('workflow.stale');
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('preserves the authoritative body byte-for-byte across temporary linkage', async () => {
    const originalBody = 'Current PR body with trailing space \n\n';
    setDetails({ body: originalBody, baseBranch: 'develop' });

    await useCase.invoke(context());

    expect(readPendingPullRequestLink(mockUpdateDescription.mock.calls[0][1])).toMatchObject({
      kind: 'pending', record: { version: 2, originalBaseBranch: 'develop' }, start: originalBody.length,
    });
    expect(mockUpdateDescription).toHaveBeenLastCalledWith(10, originalBody);
  });

  it('blocks a same-operation marker that does not match the validated original base', async () => {
    const marker = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=release%2F2.0;state=pending -->';
    setDetails({ body: `Body\n\nResolves #42\n\n${marker}`, baseBranch: 'main' });

    const results = await useCase.invoke(context());

    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].errors[0].recovery?.id).toBe('pull-request-link-base-and-reference-retained');
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('does not overwrite a current base that changed after the event snapshot', async () => {
    setDetails({ body: 'Body', baseBranch: 'release/2.0' });

    const results = await useCase.invoke(context());

    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].errors[0].code).toBe('workflow.stale');
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
  });

  it('blocks forged foreign recovery markers and never reads an event URL', async () => {
    setDetails({
      body: 'Body\n\n<!-- copilot:pr-issue-link:v1;pr=999;issue=1;state=complete -->',
      baseBranch: 'develop',
    });
    await useCase.invoke(context());
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    expect(snapshot.body).toContain('pr=999');
  });

  it.each([
    { pullRequestNumber: Number.MAX_SAFE_INTEGER + 1 },
    { defaultBranch: '../unsafe' },
    { originalBaseBranch: '' },
  ])('rejects invalid identifiers and branches before provider I/O: %p', async (override) => {
    const results = await useCase.invoke(context(override));
    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(mockGetDetails).not.toHaveBeenCalled();
    expect(mockIsLinked).not.toHaveBeenCalled();
  });
  function pendingV2() {
    return createPendingPullRequestLink({ pullRequestNumber: 10, issueNumber: 42, originalBaseBranch: 'develop',
      operationId: '11111111-1111-4111-8111-111111111111', headRepository: identity.headRepository,
      headRef: identity.headRef, headSha: identity.headSha });
  }
  it('runs recovery-only without starting a fresh linkage or observation', async () => {
    expect(await useCase.invoke(context({ recoveryOnly: true }))).toEqual([]);
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockWait).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });
  it('repairs a V2 record from a newer head before stopping an old retry', async () => {
    setDetails({ body: attachPendingPullRequestLink('Human', pendingV2()), baseBranch: 'main' });
    snapshot.identity.headSha = 'b'.repeat(40);
    mockIsLinked.mockResolvedValue(true);
    const results = await useCase.invoke(context({ expectedHeadSha: identity.headSha, recoveryOnly: true }));
    expect(snapshot).toMatchObject({ body: 'Human', baseBranch: 'develop' });
    expect(results[0].errors[0].code).toBe('workflow.stale');
    expect(mockWait).not.toHaveBeenCalled();
    expect(mockIsLinked).toHaveBeenCalledWith(10, 42);
  });
  it('does not start a fresh operation from an obsolete event head', async () => {
    const result = await useCase.invoke(context({ expectedHeadSha: 'b'.repeat(40) }));
    expect(result[0].errors[0].code).toBe('workflow.stale');
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    expect(mockIsLinked).not.toHaveBeenCalled();
  });
  it('rejects changed native head repository or ref ownership', async () => {
    for (const expected of [{ expectedHeadRepository: 'foreign/repo' }, { expectedHeadRef: 'foreign/ref' }]) {
      const results = await useCase.invoke(context(expected));
      expect(results[0].errors[0].code).toBe('workflow.stale');
    }
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    for (const changed of [{ headRepository: 'foreign/repo' }, { headRef: 'foreign/ref' }]) {
      setDetails({ body: 'Human', baseBranch: 'develop' });
      mockWait.mockImplementation(async () => { snapshot.identity = { ...snapshot.identity, ...changed }; });
      const result = await useCase.invoke(context());
      expect(result[0].errors[0].recovery?.id).toBe('pull-request-link-base-and-reference-retained');
      expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
    }
  });
  it('fails closed on missing or closed native identities', async () => {
    for (const invalid of [undefined, { ...identity, state: 'closed' }, { ...identity, number: 99 }]) {
      mockGetDetails.mockResolvedValue({ body: 'Human', baseBranch: 'develop', identity: invalid });
      const results = await useCase.invoke(context());
      expect(results[0].errors[0].code).toBe('workflow.stale');
    }
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });
  it('preserves concurrent body/configuration bytes during owned cleanup', async () => {
    mockWait.mockImplementation(async () => { snapshot.body += '\nConcurrent config'; });
    const results = await useCase.invoke(context());
    expect(results.every(result => result.success)).toBe(true);
    expect(snapshot).toMatchObject({ body: 'Current PR body\nConcurrent config', baseBranch: 'develop' });
    expect(mockGetDetails.mock.calls.length).toBeLessThanOrEqual(12);
    setDetails({ body: 'Human', baseBranch: 'develop' });
    mockUpdateDescription.mockClear();
    mockIsLinked.mockImplementationOnce(async () => { snapshot.body = 'New human'; return false; });
    const stale = await useCase.invoke(context());
    expect(stale[0].errors[0].code).toBe('workflow.stale');
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    setDetails({ body: 'Human', baseBranch: 'develop' });
    mockUpdateDescription.mockImplementationOnce(async (_pr, body) => { snapshot.body = body; snapshot.baseBranch = 'release/2.0'; });
    const movedDuringBodyWrite = await useCase.invoke(context());
    expect(movedDuringBodyWrite[0].errors[0].recovery?.id).toBe('pull-request-link-base-and-reference-retained');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
  });
  it('never compensates a replacement operation lease', async () => {
    const replacement = createPendingPullRequestLink({ pullRequestNumber: 10, issueNumber: 42, originalBaseBranch: 'develop',
      operationId: '22222222-2222-4222-8222-222222222222', headRepository: identity.headRepository,
      headRef: identity.headRef, headSha: identity.headSha });
    mockWait.mockImplementation(async () => { snapshot.body = attachPendingPullRequestLink('New human', replacement); });
    const results = await useCase.invoke(context());
    expect(results[0].success).toBe(false);
    expect(snapshot.body).toContain(replacement);
    expect(mockUpdateBaseBranch).toHaveBeenCalledTimes(1);
    expect(mockUpdateDescription).toHaveBeenCalledTimes(1);
  });
  it('compensates metadata after a head advance but blocks ordinary continuation', async () => {
    mockWait.mockImplementation(async () => { snapshot.identity.headSha = 'b'.repeat(40); });
    const results = await useCase.invoke(context());
    expect(snapshot).toMatchObject({ body: 'Current PR body', baseBranch: 'develop' });
    expect(results[0].errors[0].code).toBe('workflow.stale');
    setDetails({ body: 'Human', baseBranch: 'develop' });
    mockUpdateBaseBranch.mockImplementation(async (_pr, base) => { snapshot.baseBranch = base;
      if (base === 'main') snapshot.identity.headSha = 'b'.repeat(40); });
    const advancedDuringWrite = await useCase.invoke(context());
    expect(advancedDuringWrite[0].errors[0].code).toBe('workflow.stale');
    expect(snapshot.baseBranch).toBe('develop');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
  });
  it('retains the record if a successful restore response did not restore the base', async () => {
    mockUpdateBaseBranch.mockImplementation(async (_pr, base) => { if (base === 'main') snapshot.baseBranch = base; });
    const results = await useCase.invoke(context());
    expect(results[0].errors[0].recovery?.id).toBe('pull-request-link-base-and-reference-retained');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
    expect(mockUpdateDescription).toHaveBeenCalledTimes(1);
  });
  it('reports unverified body cleanup rather than claiming successful restoration', async () => {
    mockUpdateDescription.mockImplementation(async (_pr, body) => { if (body.includes('state=pending')) snapshot.body = body; });
    const results = await useCase.invoke(context());
    expect(snapshot.baseBranch).toBe('develop');
    expect(results[0].errors[0].recovery?.id).toBe('pull-request-link-reference-retained');
  });
  it('retains durable evidence when post-write native reads become unavailable', async () => {
    mockWait.mockImplementation(async () => { mockGetDetails.mockRejectedValue(new Error('unavailable')); });
    const results = await useCase.invoke(context());
    expect(results[0].errors[0].recovery?.id).toBe('pull-request-link-base-and-reference-retained');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
  });
  it('blocks duplicate records and mismatched V2 native ownership without mutation', async () => {
    for (const body of [attachPendingPullRequestLink('Human', pendingV2()) + '\n' + pendingV2(),
      attachPendingPullRequestLink('Human', createPendingPullRequestLink({ pullRequestNumber: 10, issueNumber: 42,
        originalBaseBranch: 'develop', operationId: '11111111-1111-4111-8111-111111111111',
        headRepository: 'foreign/repo', headRef: identity.headRef, headSha: identity.headSha }))]) {
      setDetails({ body, baseBranch: 'main' });
      const results = await useCase.invoke(context());
      expect(results[0].success).toBe(false);
    }
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    for (const marker of [pendingV2(), '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->']) {
      setDetails({ body: attachPendingPullRequestLink('Human', marker), baseBranch: 'main' });
      snapshot.identity.headRepository = 'fork/repo';
      const result = await useCase.invoke(context({ expectedHeadRepository: 'fork/repo' }));
      expect(result[0].errors[0].recovery?.id).toBe('pull-request-link-base-and-reference-retained');
    }
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('finishes an unindexed pending operation interrupted before its temporary retarget', async () => {
    setDetails({ body: attachPendingPullRequestLink('Human', pendingV2()), baseBranch: 'develop' });
    mockIsLinked.mockResolvedValueOnce(false).mockResolvedValue(true);
    const result = await useCase.invoke(context({ recoveryOnly: true, expectedHeadSha: identity.headSha }));
    expect(mockIsLinked).toHaveBeenCalledTimes(2);
    expect(mockWait).toHaveBeenCalledWith(20_000);
    expect(mockUpdateBaseBranch).toHaveBeenNthCalledWith(1, 10, 'main');
    expect(snapshot).toMatchObject({ body: 'Human', baseBranch: 'develop' });
    expect(result.every(item => item.success)).toBe(true);
    for (const change of ['concurrent-base', 'ignored-retarget']) {
      setDetails({ body: attachPendingPullRequestLink('Human', pendingV2()), baseBranch: 'develop' });
      mockIsLinked.mockReset().mockResolvedValue(false);
      if (change === 'concurrent-base') mockIsLinked.mockImplementationOnce(async () => {
        snapshot.baseBranch = 'release/2.0'; return false;
      });
      else mockUpdateBaseBranch.mockImplementationOnce(async () => {});
      const blocked = await useCase.invoke(context({ recoveryOnly: true }));
      expect(blocked[0].errors[0].code).toBe('workflow.stale');
      expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
    }
  });
  it('restores the original base but retains a pending reference still unobservable after the bounded wait', async () => {
    setDetails({ body: attachPendingPullRequestLink('Human', pendingV2()), baseBranch: 'main' });
    mockIsLinked.mockResolvedValue(false);
    const result = await useCase.invoke(context({ recoveryOnly: true }));
    expect(mockWait).toHaveBeenCalledTimes(1);
    expect(snapshot.baseBranch).toBe('develop');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
    expect(result[0].errors[0].recovery?.id).toBe('pull-request-link-reference-retained');
  });
  it('allows an obsolete event to restore the base without erasing or restarting an unconfirmed link', async () => {
    setDetails({ body: attachPendingPullRequestLink('Human', pendingV2()), baseBranch: 'main' });
    snapshot.identity.headSha = 'b'.repeat(40);
    mockIsLinked.mockResolvedValue(false);
    const result = await useCase.invoke(context({ recoveryOnly: true, expectedHeadSha: identity.headSha }));
    expect(snapshot.baseBranch).toBe('develop');
    expect(readPendingPullRequestLink(snapshot.body).kind).toBe('pending');
    expect(mockWait).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).toHaveBeenCalledTimes(1);
    expect(result[0].errors[0].code).toBe('workflow.stale');
  });

});
