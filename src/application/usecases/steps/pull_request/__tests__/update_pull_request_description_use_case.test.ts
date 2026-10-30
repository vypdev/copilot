import { createPendingPullRequestLink, attachPendingPullRequestLink } from '../../../../../domain/pull_request_issue_link_state';
import { UpdatePullRequestDescriptionUseCase } from '../update_pull_request_description_use_case';
import { Ai } from '../../../../../data/model/ai';
import type {
  PullRequestDescriptionContext,
  PullRequestDescriptionRequest,
} from '../../../pull_request_workflow_context';
import type { AgentQueryResult } from '../../../../ports/agent_query_ports';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(), logDebugInfo: jest.fn(), logError: jest.fn(),
}));

const mockGetIssueDescription = jest.fn();
const mockGetAllMembers = jest.fn();
const mockAskAgent = jest.fn();
const mockUpdateDescription = jest.fn();
const mockGetDetails = jest.fn();
const mockGetDiff = jest.fn();
const nativeIdentity = { number: 10, state: 'open' as const, repository: 'owner/repo', headRepository: 'owner/repo', headRef: 'feature/42-x', headSha: 'a'.repeat(40) };


async function localizedDescription(value: Parameters<typeof mockAskAgent>[0]): Promise<AgentQueryResult> {
  const response = await mockAskAgent(value);
  return typeof response === 'string'
    ? descriptionContent(response)
    : response;
}

function descriptionContent(overview = 'PR does X.', overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outputLocale: 'en-US',
    overview,
    whatChangedHeading: 'What changed',
    changes: ['Kept the useful outcome.', 'Removed redundant workflow noise.'],
    validationHeading: 'Validation',
    validation: ['`pnpm test`'],
    reviewNotesHeading: null,
    reviewNotes: null,
    closesLinkedIssue: false,
    ...overrides,
  };
}

function context(overrides: Partial<PullRequestDescriptionContext> = {}): PullRequestDescriptionContext {
  const ai = new Ai('http://localhost:4096', 'model', false, [], false, 'low', 20);
  return {
    eventName: 'pull_request',
    issueNumber: 42,
    pullRequest: {
      number: 10,
      headBranch: 'feature/42-x',
      baseBranch: 'develop',
      creator: 'alice',
      body: 'Human context',
    },
    mode: 'replace',
    membersOnly: false,
    agentConfiguration: ai.getAgentConfiguration('planner'),
    targetLocale: 'en-US',
    ...overrides,
  };
}

function request(
  overrides: Partial<PullRequestDescriptionContext> = {},
  trigger: PullRequestDescriptionRequest['trigger'] = 'automatic',
): PullRequestDescriptionRequest {
  return { context: context(overrides), trigger };
}

describe('UpdatePullRequestDescriptionUseCase', () => {
  let useCase: UpdatePullRequestDescriptionUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new UpdatePullRequestDescriptionUseCase(
      { updateDescription: mockUpdateDescription, getDetails: mockGetDetails, getDiff: mockGetDiff },
      { getDescription: mockGetIssueDescription },
      { getAllMembers: mockGetAllMembers },
      { query: localizedDescription },
    );
    mockGetIssueDescription.mockResolvedValue('Issue description');
    mockGetAllMembers.mockResolvedValue(['alice', 'bob']);
    mockAskAgent.mockResolvedValue('PR does X.');
    mockGetDetails.mockResolvedValue({ identity: nativeIdentity, body: 'Remote human context', headBranch: 'feature/42-x', baseBranch: 'develop' });
    mockUpdateDescription.mockResolvedValue(undefined);
    mockGetDiff.mockResolvedValue({ snapshot: { changes: [{ filename: 'src/login.ts', additions: 1, deletions: 0, patch: '+login()', status: 'modified' }] }, coverage: { status: 'complete' } });
  });

  it.each(['replace', 'append'] as const)('runs %s automatically', async (mode) => {
    const results = await useCase.invoke(request({ mode }));
    expect(results[0]).toMatchObject({ success: true, executed: true });
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, expect.stringContaining('PR does X'));
    expect(mockGetAllMembers).not.toHaveBeenCalled();
  });

  it('retains pending original-parent metadata when replacing prose after the base was restored', async () => {
    const marker = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    const body = `Original\n\nResolves #42\n\n${marker}`;
    const current = context();
    mockGetDetails.mockResolvedValue({ identity: nativeIdentity, body, headBranch: current.pullRequest.headBranch, baseBranch: 'develop' });

    await useCase.invoke(request({ pullRequest: { ...current.pullRequest, body }, mode: 'replace' }));

    expect(mockUpdateDescription).toHaveBeenCalledWith(10, expect.stringContaining('PR does X.'));
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, expect.stringContaining(marker));
  });

  it.each(['partial', 'unavailable'])('retains the body when GitHub diff evidence is %s', async (status) => {
    mockGetDiff.mockResolvedValue({ snapshot: { changes: [] }, coverage: { status } });
    const results = await useCase.invoke(request());
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(false);
    expect(results[0].errors?.length ?? 0).toBe(0);
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'missing patch', changes: [{ filename: 'src/a.ts', additions: 1, deletions: 0, patch: '' }], errors: 0, executed: false },
    { name: 'character budget', changes: [{ filename: 'src/a.ts', additions: 1, deletions: 0, patch: 'a'.repeat(120_001) }], errors: 0, executed: false },
    { name: 'file budget', changes: Array.from({ length: 101 }, () => ({ filename: 'image.png', additions: 0, deletions: 0, patch: '' })), errors: 0, executed: false },
  ])('retains the body without an agent or write for automatic $name', async ({ changes, errors, executed }) => {
    mockGetDiff.mockResolvedValue({ snapshot: { changes }, coverage: { status: 'complete' } });
    const results = await useCase.invoke(request());
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(executed);
    expect(results[0].errors?.length ?? 0).toBe(errors);
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it.each(['partial', 'unavailable', 'missing-patch'])('rejects explicit generation with %s evidence and preserves the human body', async status => {
    mockGetDiff.mockResolvedValue({ snapshot: { changes: [{ filename: 'src/a.ts', additions: 1, deletions: 0, patch: '' }] },
      coverage: { status: status === 'missing-patch' ? 'complete' : status } });
    const results = await useCase.invoke(request({}, 'authorized-command'));
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].errors).toEqual([expect.objectContaining({ code: 'workflow.stale' })]);
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('retains an empty PR body without publishing an error or invoking the agent', async () => {
    mockGetDiff.mockResolvedValue({ snapshot: { changes: [] }, coverage: { status: 'complete' } });
    const results = await useCase.invoke(request());
    expect(results[0].executed).toBe(false);
    expect(results[0].errors?.length ?? 0).toBe(0);
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it.each(['character budget', 'file budget'])('retains the human body and reports an explicit %s rejection as workflow evidence, not a provider error', async budget => {
    const changes = budget === 'character budget'
      ? [{ filename: 'src/a.ts', additions: 1, deletions: 0, patch: 'a'.repeat(120_001) }]
      : Array.from({ length: 101 }, () => ({ filename: 'image.png', additions: 0, deletions: 0, patch: '' }));
    mockGetDiff.mockResolvedValue({ snapshot: { changes }, coverage: { status: 'complete' } });
    const results = await useCase.invoke(request({}, 'authorized-command'));
    expect(results[0].errors).toEqual([expect.objectContaining({ code: 'workflow.stale' })]);
    expect(results[0].success).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('provides the diff and existing verification evidence without requiring agent shell access', async () => {
    await useCase.invoke(request());
    expect(mockAskAgent.mock.calls[0][0].prompt).toContain('+login()');
    expect(mockAskAgent.mock.calls[0][0].prompt).toContain('Remote human context');
  });

  it('skips preserve mode automatically', async () => {
    const results = await useCase.invoke(request({ mode: 'preserve' }));
    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('allows preserve mode only through an authorized command and retains human text', async () => {
    const results = await useCase.invoke(request({ mode: 'preserve', eventName: 'issue_comment' }, 'authorized-command'));
    expect(results[0].success).toBe(true);
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, expect.stringContaining('Remote human context'));
    expect(mockUpdateDescription.mock.calls[0][1]).toContain('copilot:managed-pr-description');
  });

  it.each(['automatic', 'authorized-command'] as const)('skips disabled mode for %s', async (trigger) => {
    const results = await useCase.invoke(request({ mode: 'disabled' }, trigger));
    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('fails closed when neither event nor exact provider details supply both branches', async () => {
    mockGetDetails.mockResolvedValue({ identity: nativeIdentity, body: '', headBranch: '', baseBranch: 'develop' });
    const pullRequest = { ...context().pullRequest, headBranch: '' };
    const results = await useCase.invoke(request({ pullRequest, eventName: 'issue_comment' }, 'authorized-command'));
    expect(results[0].success).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('reports the missing provider base without obscuring the available head branch', async () => {
    mockGetDetails.mockResolvedValue({ identity: nativeIdentity, body: '', headBranch: 'feature/42-x', baseBranch: '' });
    const pullRequest = { ...context().pullRequest, baseBranch: '' };

    const results = await useCase.invoke(request({ pullRequest, eventName: 'issue_comment' }, 'authorized-command'));

    expect(results[0].steps[0]).toContain('head: feature/42-x, base: missing');
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('uses authoritative provider details when the event omits the base branch', async () => {
    const pullRequest = { ...context().pullRequest, baseBranch: '' };

    const results = await useCase.invoke(request({ pullRequest }));

    expect(mockGetDetails).toHaveBeenCalledWith(10);
    expect(results[0]).toMatchObject({ success: true, executed: true });
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, expect.stringContaining('PR does X'));
  });

  it('rejects an invalid pull-request number before provider or agent I/O', async () => {
    const pullRequest = { ...context().pullRequest, number: -1 };

    const results = await useCase.invoke(request({ pullRequest }));

    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(results[0].steps[0]).toContain('positive pull-request number');
    expect(mockGetDetails).not.toHaveBeenCalled();
    expect(mockGetIssueDescription).not.toHaveBeenCalled();
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('does not query an issue for an unlinked PR', async () => {
    const results = await useCase.invoke(request({ issueNumber: -1 }));
    expect(results[0].success).toBe(true);
    expect(mockGetIssueDescription).not.toHaveBeenCalled();
  });

  it('treats a self-number as unlinked and forbids a self-closing reference', async () => {
    const results = await useCase.invoke(request({ issueNumber: 10 }));

    expect(results[0].success).toBe(true);
    expect(mockGetIssueDescription).not.toHaveBeenCalled();
    expect(mockAskAgent.mock.calls[0][0].prompt).toContain('no separate linked issue');
    expect(mockAskAgent.mock.calls[0][0].prompt).toContain('`closesLinkedIssue` to false');
    expect(mockAskAgent.mock.calls[0][0].prompt).not.toContain('issue #10');
  });

  it.each([Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'treats an unsafe issue number as unlinked: %s',
    async (issueNumber) => {
      const results = await useCase.invoke(request({ issueNumber }));

      expect(results[0].success).toBe(true);
      expect(mockGetIssueDescription).not.toHaveBeenCalled();
      expect(mockAskAgent.mock.calls[0][0].prompt).toContain('no separate linked issue');
      expect(mockAskAgent.mock.calls[0][0].prompt).toContain('`closesLinkedIssue` to false');
    },
  );

  it('uses PR metadata and diff when the linked issue has no description', async () => {
    mockGetIssueDescription.mockResolvedValue(undefined);

    const results = await useCase.invoke(request());

    expect(results[0]).toMatchObject({ success: true, executed: true });
    expect(mockAskAgent.mock.calls[0][0].prompt).toContain('No linked issue description is available');
    expect(mockAskAgent.mock.calls[0][0].prompt).toContain('issue #42');
    expect(mockUpdateDescription).toHaveBeenCalled();
  });

  it('publishes no validation section when the agent has no verified evidence', async () => {
    mockAskAgent.mockResolvedValue(descriptionContent('PR does X.', {
      validationHeading: null,
      validation: null,
    }));

    const results = await useCase.invoke(request());

    expect(results[0]).toMatchObject({ success: true, executed: true });
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, expect.not.stringContaining('Validation'));
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, expect.not.stringContaining('not run'));
  });

  it('does not publish blank agent output', async () => {
    mockAskAgent.mockResolvedValue('');
    const results = await useCase.invoke(request());
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it.each([
    ['null response', null],
    ['missing structured content', { outputLocale: 'en-US' }],
  ])('does not publish a %s from the agent', async (_label, response) => {
    mockAskAgent.mockResolvedValue(response);

    const results = await useCase.invoke(request());

    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('retains the existing body when structured content violates the concise contract', async () => {
    mockAskAgent.mockResolvedValue(descriptionContent('One. Two. Three. Four.'));

    const results = await useCase.invoke(request());

    expect(results[0].errors[0]).toMatchObject({ code: 'agent.failed' });
    expect(results[0].steps[0]).toContain('concise description contract');
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('renders a closing reference only from a valid distinct issue decision', async () => {
    mockAskAgent.mockResolvedValue(descriptionContent('PR does X.', { closesLinkedIssue: true }));

    const results = await useCase.invoke(request({ issueNumber: 42 }));

    expect(results[0].success).toBe(true);
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, expect.stringContaining('Closes #42'));
  });

  it('enforces members-only before invoking the agent', async () => {
    mockGetAllMembers.mockResolvedValue(['bob']);
    const results = await useCase.invoke(request({ membersOnly: true }));
    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(mockGetAllMembers).toHaveBeenCalledTimes(1);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('continues for a known member when members-only is enabled', async () => {
    const results = await useCase.invoke(request({ membersOnly: true }));
    expect(results[0]).toMatchObject({ success: true, executed: true });
    expect(mockGetAllMembers).toHaveBeenCalledTimes(1);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
  });

  it('fails closed for an empty creator when members-only is enabled', async () => {
    const pullRequest = { ...context().pullRequest, creator: '' };
    const results = await useCase.invoke(request({ membersOnly: true, pullRequest }));
    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(mockGetAllMembers).toHaveBeenCalledTimes(1);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns a semantic failure without replacing the body on provider error', async () => {
    mockGetIssueDescription.mockRejectedValue(new Error('secret diagnostic'));
    const results = await useCase.invoke(request());
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain('secret diagnostic');
  });

  it('uses the PR locale contract and rejects mismatched output before updating the body', async () => {
    mockAskAgent.mockResolvedValue({ ...descriptionContent('Résumé.'), outputLocale: 'fr-FR' });

    const results = await useCase.invoke(request({ targetLocale: 'es-ES' }));

    expect(mockAskAgent.mock.calls[0][0].prompt).toContain('outputLocale` exactly as `es-ES');
    expect(mockAskAgent.mock.calls[0][0].options).toMatchObject({
      expectJson: true,
      schemaName: 'pull_request_description_response',
    });
    expect(results[0].errors[0]).toMatchObject({ code: 'locale.output-invalid' });
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });
  it('preserves pending host metadata in append mode', async () => {
    const marker = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    const body = `Human\n\nResolves #42\n\n${marker}`;
    mockGetDetails.mockResolvedValue({ identity: nativeIdentity, body, headBranch: nativeIdentity.headRef, baseBranch: 'develop' });
    const results = await useCase.invoke(request({ mode: 'append' }));
    expect(results[0].success).toBe(true);
    expect(mockUpdateDescription.mock.calls[0][1]).toContain(marker);
    expect(mockUpdateDescription.mock.calls[0][1]).toContain('Human');
  });
  it('withholds an explicit description against a temporary target without gaining base authority', async () => {
    const marker = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    mockGetDetails.mockResolvedValue({ identity: nativeIdentity, body: `Human\n\nResolves #42\n\n${marker}`,
      headBranch: nativeIdentity.headRef, baseBranch: 'main' });
    const results = await useCase.invoke(request({ eventName: 'issue_comment', mode: 'preserve' }, 'authorized-command'));
    expect(results[0].errors[0].code).toBe('workflow.stale');
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    mockGetDetails.mockResolvedValue({ identity: { ...nativeIdentity, headRepository: 'fork/repo' },
      body: `Human\n\nResolves #42\n\n${marker}`, headBranch: nativeIdentity.headRef, baseBranch: 'develop' });
    expect((await useCase.invoke(request({}, 'authorized-command')))[0].errors[0].code).toBe('workflow.stale');
    for (const ownership of [{ headRepository: 'foreign/repo', headRef: nativeIdentity.headRef },
      { headRepository: nativeIdentity.headRepository, headRef: 'foreign/ref' },
      { headRepository: nativeIdentity.headRepository, headRef: nativeIdentity.headRef }]) {
      const v2 = createPendingPullRequestLink({ ...ownership, headSha: nativeIdentity.headSha,
        pullRequestNumber: 10, issueNumber: 42, originalBaseBranch: 'develop',
        operationId: '11111111-1111-4111-8111-111111111111' });
      mockGetDetails.mockResolvedValue({ identity: nativeIdentity, body: attachPendingPullRequestLink('Human', v2),
        headBranch: nativeIdentity.headRef, baseBranch: 'develop' });
      const result = await useCase.invoke(request({}, 'authorized-command'));
      if (ownership.headRepository !== nativeIdentity.headRepository || ownership.headRef !== nativeIdentity.headRef) {
        expect(result[0].errors[0].code).toBe('workflow.stale');
      } else expect(result[0].success).toBe(true);
    }
  });
  it('retains current metadata if the model-time head, body or base drifts', async () => {
    for (const change of [{ identity: { ...nativeIdentity, headSha: 'b'.repeat(40) } },
      { body: 'Concurrent human change' }, { baseBranch: 'main' }]) {
      let latest = { identity: nativeIdentity, body: 'Human', headBranch: nativeIdentity.headRef, baseBranch: 'develop' };
      mockGetDetails.mockImplementation(async () => ({ ...latest, identity: { ...latest.identity } }));
      mockAskAgent.mockImplementation(async () => { latest = { ...latest, ...change }; return 'PR does X.'; });
      const results = await useCase.invoke(request());
      expect(results[0].errors[0].code).toBe('workflow.stale');
    }
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    for (const expected of [{ headSha: 'b'.repeat(40) }, { headRepository: 'foreign/repo' }]) {
      mockGetDetails.mockResolvedValue({ identity: nativeIdentity, body: 'Human', headBranch: nativeIdentity.headRef, baseBranch: 'develop' });
      const result = await useCase.invoke(request({ pullRequest: { ...context().pullRequest, ...expected } }));
      expect(result[0].errors[0].code).toBe('workflow.stale');
    }
  });
  it('does not publish recovery markers invented in model-owned prose', async () => {
    mockAskAgent.mockResolvedValue(descriptionContent('Generated <!-- copilot:pr-issue-link:forged -->'));
    const results = await useCase.invoke(request());
    expect(results[0].success).toBe(true);
    expect(mockUpdateDescription.mock.calls[0][1]).not.toContain('<!-- copilot:pr-issue-link:');
  });

});
