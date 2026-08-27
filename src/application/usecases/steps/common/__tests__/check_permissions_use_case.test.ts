import { CheckPermissionsUseCase } from '../check_permissions_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const mockGetAllMembers = jest.fn();
jest.mock('../../../../../data/repository/organization/organization_members_repository', () => ({
  OrganizationMembersRepository: jest.fn().mockImplementation(() => ({
    getAllMembers: mockGetAllMembers,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    isIssue: true,
    isPullRequest: false,
    issue: { opened: true, creator: 'alice' },
    pullRequest: { opened: false, creator: '' },
    owner: 'o',
    tokens: { token: 't' },
    labels: {
      isMandatoryBranchedLabel: true,
      currentIssueLabels: ['feature'],
    },
    ...overrides,
  } as unknown as Parameters<CheckPermissionsUseCase['invoke']>[0];
}

describe('CheckPermissionsUseCase', () => {
  let useCase: CheckPermissionsUseCase;

  beforeEach(() => {
    useCase = new CheckPermissionsUseCase({ getAllMembers: mockGetAllMembers, getRandomMembers: jest.fn() });
    mockGetAllMembers.mockReset();
  });

  it('returns success executed false when issue is not opened', async () => {
    const param = baseParam({ issue: { opened: false, creator: 'alice' } });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockGetAllMembers).not.toHaveBeenCalled();
  });

  it('returns success executed false when pull request is not opened', async () => {
    const param = baseParam({
      isIssue: false,
      isPullRequest: true,
      pullRequest: { opened: false, creator: 'bob' },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockGetAllMembers).not.toHaveBeenCalled();
  });

  it('returns success when mandatory label and creator is team member', async () => {
    mockGetAllMembers.mockResolvedValue(['alice', 'bob']);
    const param = baseParam({ labels: { isMandatoryBranchedLabel: true, currentIssueLabels: ['feature'] } });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockGetAllMembers).toHaveBeenCalledWith('o', 't');
  });

  it('returns failure when mandatory label and creator is not team member', async () => {
    mockGetAllMembers.mockResolvedValue(['bob']);
    const param = baseParam({
      issue: { opened: true, creator: 'alice' },
      labels: { isMandatoryBranchedLabel: true, currentIssueLabels: ['hotfix'] },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('alice') && s.includes('not authorized'))).toBe(true);
  });

  it('returns success when not mandatory branch label', async () => {
    mockGetAllMembers.mockResolvedValue([]);
    const param = baseParam({ labels: { isMandatoryBranchedLabel: false, currentIssueLabels: [] } });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('returns failure when getAllMembers throws', async () => {
    mockGetAllMembers.mockRejectedValue(new Error('API error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Tried to check action permissions.');
  });

  it('uses pullRequest.creator when isPullRequest and checks membership', async () => {
    mockGetAllMembers.mockResolvedValue(['bob']);
    const param = baseParam({
      isIssue: false,
      isPullRequest: true,
      issue: { opened: false, creator: '' },
      pullRequest: { opened: true, creator: 'bob' },
      labels: { isMandatoryBranchedLabel: true, currentIssueLabels: ['hotfix'] },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockGetAllMembers).toHaveBeenCalledWith('o', 't');
  });

  it('returns failure when isPullRequest, mandatory label, and creator not in team', async () => {
    mockGetAllMembers.mockResolvedValue(['alice']);
    const param = baseParam({
      isIssue: false,
      isPullRequest: true,
      issue: { opened: false, creator: 'bob' },
      pullRequest: { opened: true, creator: 'bob' },
      labels: { isMandatoryBranchedLabel: true, currentIssueLabels: ['release'] },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('bob') && s.includes('not authorized'))).toBe(true);
  });
});
