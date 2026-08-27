import { RemoveNotNeededBranchesUseCase } from '../remove_not_needed_branches_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockFormatBranchName = jest.fn();
const mockGetListOfBranches = jest.fn();
const mockRemoveBranch = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    issueNumber: 42,
    tokens: { token: 't' },
    issue: { title: 'Add login' },
    managementBranch: 'feature',
    branches: { featureTree: 'feature', bugfixTree: 'bugfix' },
    ...overrides,
  } as unknown as Parameters<RemoveNotNeededBranchesUseCase['invoke']>[0];
}

describe('RemoveNotNeededBranchesUseCase', () => {
  let useCase: RemoveNotNeededBranchesUseCase;

  beforeEach(() => {
    useCase = new RemoveNotNeededBranchesUseCase(
      { getListOfBranches: mockGetListOfBranches, removeBranch: mockRemoveBranch },
      { formatBranchName: mockFormatBranchName },
    );
    mockFormatBranchName.mockReturnValue('add-login');
    mockGetListOfBranches.mockResolvedValue(['feature/42-add-login', 'bugfix/42-old-name']);
    mockRemoveBranch.mockResolvedValue(true);
  });

  it('returns a result when issue title is empty', async () => {
    const param = baseParam({ issue: { title: '' } });
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.steps?.some((s) => s.includes('title was not found')))).toBe(true);
  });

  it('removes branches that do not match final branch name', async () => {
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockFormatBranchName).toHaveBeenCalledWith('Add login', 42);
    expect(mockGetListOfBranches).toHaveBeenCalledWith('o', 'r', 't');
    expect(mockRemoveBranch).toHaveBeenCalled();
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('returns failure on error', async () => {
    mockGetListOfBranches.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.success === false)).toBe(true);
  });

  it('continues when type does not match managementBranch and no matching branch exists', async () => {
    mockGetListOfBranches.mockReset();
    mockGetListOfBranches.mockResolvedValue(['develop', 'main']);
    mockRemoveBranch.mockClear();
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockRemoveBranch).not.toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });

  it('pushes failure result when removeBranch returns false', async () => {
    mockGetListOfBranches.mockResolvedValue(['feature/42-add-login', 'bugfix/42-other']);
    mockRemoveBranch.mockResolvedValue(false);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results.some((r) => !r.success && r.steps?.some((s) => s.includes('problem')))).toBe(true);
  });

  it('removes non-final branches when type equals managementBranch', async () => {
    mockFormatBranchName.mockReturnValue('add-login');
    mockGetListOfBranches.mockResolvedValue(['feature/42-add-login', 'feature/42-old-name']);
    mockRemoveBranch.mockResolvedValue(true);
    const param = baseParam({ managementBranch: 'feature' });

    const results = await useCase.invoke(param);

    expect(mockRemoveBranch).toHaveBeenCalledWith('o', 'r', 'feature/42-old-name', 't');
    expect(results.some((r) => r.steps?.some((s) => s.includes('feature/42-old-name')))).toBe(true);
  });
});
