import { UpdatePullRequestDescriptionUseCase } from '../update_pull_request_description_use_case';
import { Ai } from '../../../../../data/model/ai';
import type {
  PullRequestDescriptionContext,
  PullRequestDescriptionRequest,
} from '../../../pull_request_workflow_context';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(), logDebugInfo: jest.fn(), logError: jest.fn(),
}));

const mockGetIssueDescription = jest.fn();
const mockGetAllMembers = jest.fn();
const mockAskAgent = jest.fn();
const mockUpdateDescription = jest.fn();
const mockGetDetails = jest.fn();

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
      { updateDescription: mockUpdateDescription, getDetails: mockGetDetails },
      { getDescription: mockGetIssueDescription },
      { getAllMembers: mockGetAllMembers },
      { query: (value) => mockAskAgent(value) },
    );
    mockGetIssueDescription.mockResolvedValue('Issue description');
    mockGetAllMembers.mockResolvedValue(['alice', 'bob']);
    mockAskAgent.mockResolvedValue('## Summary\nPR does X.');
    mockGetDetails.mockResolvedValue({ body: 'Remote human context', headBranch: 'feature/42-x', baseBranch: 'develop' });
    mockUpdateDescription.mockResolvedValue(undefined);
  });

  it.each(['replace', 'append'] as const)('runs %s automatically', async (mode) => {
    const results = await useCase.invoke(request({ mode }));
    expect(results[0]).toMatchObject({ success: true, executed: true });
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, expect.stringContaining('PR does X'));
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
    mockGetDetails.mockResolvedValue({ body: '', headBranch: '', baseBranch: 'develop' });
    const pullRequest = { ...context().pullRequest, headBranch: '' };
    const results = await useCase.invoke(request({ pullRequest, eventName: 'issue_comment' }, 'authorized-command'));
    expect(results[0].success).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('does not query an issue for an unlinked PR', async () => {
    const results = await useCase.invoke(request({ issueNumber: -1 }));
    expect(results[0].success).toBe(true);
    expect(mockGetIssueDescription).not.toHaveBeenCalled();
  });

  it('does not publish blank agent output', async () => {
    mockAskAgent.mockResolvedValue('');
    const results = await useCase.invoke(request());
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('enforces members-only before invoking the agent', async () => {
    mockGetAllMembers.mockResolvedValue(['bob']);
    const results = await useCase.invoke(request({ membersOnly: true }));
    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns a semantic failure without replacing the body on provider error', async () => {
    mockGetIssueDescription.mockRejectedValue(new Error('secret diagnostic'));
    const results = await useCase.invoke(request());
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain('secret diagnostic');
  });
});
