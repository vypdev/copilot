import { AssignMemberToIssueUseCase } from '../assign_members_to_issue_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGetAllMembers = jest.fn();
const mockGetRandomMembers = jest.fn();
jest.mock('../../../../../data/repository/organization/organization_members_repository', () => ({
  OrganizationMembersRepository: jest.fn().mockImplementation(() => ({
    getAllMembers: mockGetAllMembers,
    getRandomMembers: mockGetRandomMembers,
  })),
}));

const mockGetCurrentAssignees = jest.fn();
const mockAssignMembersToIssue = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    tokens: { token: 't' },
    issue: { number: 42, desiredAssigneesCount: 1, creator: 'alice' },
    pullRequest: { number: 42, creator: '' },
    isIssue: true,
    isPullRequest: false,
    ...overrides,
  } as unknown as Parameters<AssignMemberToIssueUseCase['invoke']>[0];
}

describe('AssignMemberToIssueUseCase', () => {
  let useCase: AssignMemberToIssueUseCase;

  beforeEach(() => {
    useCase = new AssignMemberToIssueUseCase({ getCurrentAssignees: mockGetCurrentAssignees, assignMembersToIssue: mockAssignMembersToIssue }, { getAllMembers: mockGetAllMembers, getRandomMembers: mockGetRandomMembers });
    mockGetAllMembers.mockResolvedValue(['alice', 'bob']);
    mockGetCurrentAssignees.mockResolvedValue([]);
    mockGetRandomMembers.mockResolvedValue(['bob']);
    mockAssignMembersToIssue.mockResolvedValue(['bob']);
  });

  it('assigns issue creator when creator is team member and not yet assigned', async () => {
    const param = baseParam({ issue: { number: 42, desiredAssigneesCount: 1, creator: 'alice' } });
    const results = await useCase.invoke(param);
    expect(mockAssignMembersToIssue).toHaveBeenCalledWith('o', 'r', 42, ['alice'], 't');
    expect(results.some((r) => r.success && r.steps?.some((s) => s.includes('alice')))).toBe(true);
  });

  it('returns success executed true when no more assignees needed after assigning creator', async () => {
    const param = baseParam({ issue: { number: 42, desiredAssigneesCount: 1, creator: 'alice' } });
    mockGetCurrentAssignees.mockResolvedValue([]);
    const results = await useCase.invoke(param);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.success === true)).toBe(true);
  });

  it('assigns random members when more assignees needed', async () => {
    mockGetCurrentAssignees.mockResolvedValue([]);
    mockGetAllMembers.mockResolvedValue(['alice', 'bob']);
    const param = baseParam({
      issue: { number: 42, desiredAssigneesCount: 2, creator: '' },
    });
    mockAssignMembersToIssue.mockResolvedValue(['bob']);
    const results = await useCase.invoke(param);
    expect(mockGetRandomMembers).toHaveBeenCalledWith('o', 2, [], 't');
    expect(mockAssignMembersToIssue).toHaveBeenCalled();
  });

  it('returns failure when no members found for assignment', async () => {
    mockGetRandomMembers.mockResolvedValue([]);
    mockGetCurrentAssignees.mockResolvedValue([]);
    const param = baseParam({
      issue: { number: 42, desiredAssigneesCount: 1, creator: '' },
    });
    const results = await useCase.invoke(param);
    expect(results.some((r) => !r.success && r.steps?.some((s) => s.includes('no one was found')))).toBe(true);
  });

  it('returns failure on repository error', async () => {
    mockGetCurrentAssignees.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.success === false)).toBe(true);
  });

  it('assigns PR creator when isPullRequest and creator is team member and not yet assigned', async () => {
    mockGetAllMembers.mockResolvedValue(['bob', 'alice']);
    mockGetCurrentAssignees.mockResolvedValue([]);
    mockAssignMembersToIssue.mockResolvedValue(['bob']);
    const param = baseParam({
      isIssue: false,
      isPullRequest: true,
      issue: { number: 99, desiredAssigneesCount: 1, creator: '' },
      pullRequest: { number: 99, desiredAssigneesCount: 1, creator: 'bob' },
    });

    const results = await useCase.invoke(param);

    expect(mockAssignMembersToIssue).toHaveBeenCalledWith('o', 'r', 99, ['bob'], 't');
    expect(results.some((r) => r.success && r.steps?.some((s) => s.includes('bob') && s.includes('creator')))).toBe(
      true
    );
  });
});
