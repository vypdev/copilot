import { RemoveIssueBranchesUseCase } from '../remove_issue_branches_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGetListOfBranches = jest.fn();
const mockRemoveBranch = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    issueNumber: 42,
    managedBranchTypes: ['feature', 'bugfix'],
    hotfixBranchType: 'hotfix',
    ...overrides,
  } as unknown as Parameters<RemoveIssueBranchesUseCase['invoke']>[0];
}

describe('RemoveIssueBranchesUseCase', () => {
  let useCase: RemoveIssueBranchesUseCase;

  beforeEach(() => {
    useCase = new RemoveIssueBranchesUseCase({ getListOfBranches: mockGetListOfBranches, removeBranch: mockRemoveBranch });
    mockGetListOfBranches.mockResolvedValue(['develop', 'main', 'feature/42-old-name']);
    mockRemoveBranch.mockResolvedValue(true);
    mockRemoveBranch.mockClear();
  });

  it('removes matching branch for issue and returns success', async () => {
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockGetListOfBranches).toHaveBeenCalledWith();
    expect(mockRemoveBranch).toHaveBeenCalledWith('feature/42-old-name');
    expect(results.some((r) => r.success && r.steps?.some((s) => s.includes('feature/42-old-name')))).toBe(true);
  });

  it('returns no removal when no matching branch prefix', async () => {
    mockGetListOfBranches.mockResolvedValue(['develop', 'main']);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockRemoveBranch).not.toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });

  it('returns failure on error', async () => {
    mockGetListOfBranches.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.success === false)).toBe(true);
  });

  it('adds hotfix reminder when branch removed and previousConfiguration.branchType is hotfixTree', async () => {
    mockGetListOfBranches.mockResolvedValue(['feature/42-foo', 'develop', 'main']);
    mockRemoveBranch.mockResolvedValue(true);
    const param = baseParam({
      previousBranchType: 'hotfix',
    });

    const results = await useCase.invoke(param);

    expect(results.some((r) => r.reminders?.some((m) => m.includes('hotfix') && m.includes('no longer required')))).toBe(
      true
    );
  });
});
