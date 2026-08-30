import { UpdatePullRequestDescriptionUseCase } from '../update_pull_request_description_use_case';
import { Ai } from '../../../../../data/model/ai';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGetIssueDescription = jest.fn();

const mockGetAllMembers = jest.fn();
jest.mock('../../../../../data/repository/organization/organization_members_repository', () => ({
  OrganizationMembersRepository: jest.fn().mockImplementation(() => ({
    getAllMembers: mockGetAllMembers,
  })),
}));

const mockAskAgent = jest.fn();

const mockUpdateDescription = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    issueNumber: 42,
    tokens: { token: 't' },
    pullRequest: { number: 10, head: 'feature/42-x', base: 'develop', creator: 'alice' },
    ai: new Ai('http://localhost:4096', 'model', false, false, [], false, 'low', 20),
    ...overrides,
  } as unknown as Parameters<UpdatePullRequestDescriptionUseCase['invoke']>[0];
}

describe('UpdatePullRequestDescriptionUseCase', () => {
  let useCase: UpdatePullRequestDescriptionUseCase;

  beforeEach(() => {
    mockGetIssueDescription.mockClear();
    mockGetAllMembers.mockClear();
    mockAskAgent.mockClear();
    mockUpdateDescription.mockClear();
    useCase = new UpdatePullRequestDescriptionUseCase(
      { updateDescription: mockUpdateDescription },
      { getDescription: mockGetIssueDescription },
      { getAllMembers: mockGetAllMembers, getRandomMembers: jest.fn() },
      { query: (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => mockAskAgent(request.configuration, request.agentId, request.prompt, request.options) },
    );
    mockGetIssueDescription.mockResolvedValue('Issue description');
    mockGetAllMembers.mockResolvedValue(['alice', 'bob']);
    mockAskAgent.mockResolvedValue('## Summary\nPR does X.');
    mockUpdateDescription.mockResolvedValue(undefined);
  });

  it('returns failure when head or base branch is missing', async () => {
    const param = baseParam({ pullRequest: { number: 10, head: '', base: 'develop', creator: 'alice' } });
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('Could not determine PR branches'))).toBe(true);
  });

  it('returns failure when no issue description', async () => {
    mockGetIssueDescription.mockResolvedValue('');
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('No issue description'))).toBe(true);
  });

  it('generates a description for a PR without a linked issue', async () => {
    mockGetIssueDescription.mockResolvedValue(undefined);
    mockAskAgent.mockResolvedValue('# Summary\n\nGenerated from the PR diff.');
    const param = baseParam({
      issueNumber: -1,
      pullRequest: { number: 12, head: 'feature/no-issue', base: 'develop', creator: 'alice' },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetIssueDescription).not.toHaveBeenCalled();
    expect(mockUpdateDescription).toHaveBeenCalledWith(
      'o',
      'r',
      12,
      expect.stringContaining('# Summary'),
      't',
    );
    expect(mockAskAgent.mock.calls[0][2]).toContain('Do not add a Closes line');
  });

  it('updates PR description when AI returns body and creator is team member', async () => {
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockAskAgent).toHaveBeenCalled();
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('feature/42-x');
    expect(prompt).toContain('develop');
    expect(prompt).toContain('Issue description');
    expect(prompt).toContain('Closes #42');
    expect(mockUpdateDescription).toHaveBeenCalledWith('o', 'r', 10, '## Summary\nPR does X.', 't');
    expect(results.some((r) => r.success === true)).toBe(true);
  });

  it('returns failure when AI returns empty description', async () => {
    mockAskAgent.mockResolvedValue('');
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('did not return a PR description'))).toBe(true);
  });

  it('skips update when creator is not team member and AI members only is enabled', async () => {
    mockGetAllMembers.mockResolvedValue(['bob', 'carol']);
    const aiMembersOnly = new Ai(
      'http://localhost:4096',
      'model',
      false,
      true, // aiMembersOnly
      [],
      false,
      'low',
      20
    );
    expect(aiMembersOnly.getAiMembersOnly()).toBe(true);
    const param = baseParam({
      pullRequest: { number: 10, head: 'feature/42-x', base: 'develop', creator: 'alice' },
      ai: aiMembersOnly,
    });
    mockAskAgent.mockClear();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('not a team member') && s.includes('AI members only'))).toBe(
      true
    );
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns failure on error', async () => {
    mockGetIssueDescription.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
  });
});
