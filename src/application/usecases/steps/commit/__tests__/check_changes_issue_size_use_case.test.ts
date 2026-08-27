import { CheckChangesIssueSizeUseCase } from '../check_changes_issue_size_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGetSizeCategoryAndReason = jest.fn();
const mockSetLabels = jest.fn();
const mockGetLabels = jest.fn();
const mockSetTaskSize = jest.fn();
const mockGetOpenPullRequestNumbersByHeadBranch = jest.fn();


function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    issueNumber: 42,
    tokens: { token: 't' },
    commit: { branch: 'feature/42-foo' },
    currentConfiguration: { parentBranch: 'develop' },
    sizeThresholds: {},
    labels: {
      sizedLabelOnIssue: 'size: M',
      currentIssueLabels: ['feature', 'size: M'],
      sizeLabels: ['size: XS', 'size: S', 'size: M', 'size: L', 'size: XL', 'size: XXL'],
    },
    project: { getProjects: () => [] },
    ...overrides,
  } as unknown as Parameters<CheckChangesIssueSizeUseCase['invoke']>[0];
}

describe('CheckChangesIssueSizeUseCase', () => {
  let useCase: CheckChangesIssueSizeUseCase;

  beforeEach(() => {
    useCase = new CheckChangesIssueSizeUseCase(
      { setTaskSize: mockSetTaskSize } as any,
      { setLabels: mockSetLabels, getLabels: mockGetLabels } as any,
      { getOpenPullRequestNumbersByHeadBranch: mockGetOpenPullRequestNumbersByHeadBranch } as any,
      { getSizeCategoryAndReason: mockGetSizeCategoryAndReason } as any,
    );
    mockGetSizeCategoryAndReason.mockReset();
    mockSetLabels.mockReset();
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);
  });

  it('uses branches.development or "develop" as base when parentBranch is undefined', async () => {
    mockGetSizeCategoryAndReason.mockResolvedValue({
      size: 'size: M',
      githubSize: 'M',
      reason: 'Within limits',
    });
    const param = baseParam({
      currentConfiguration: { parentBranch: undefined },
      branches: { development: 'develop' },
    } as Record<string, unknown>);

    const results = await useCase.invoke(param);

    expect(mockGetSizeCategoryAndReason).toHaveBeenCalledWith(
      'o',
      'r',
      'feature/42-foo',
      'develop',
      expect.anything(),
      expect.anything(),
      't'
    );
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns success executed true when size equals sizedLabelOnIssue (no change)', async () => {
    mockGetSizeCategoryAndReason.mockResolvedValue({
      size: 'size: M',
      githubSize: 'M',
      reason: 'Within limits',
    });
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockSetLabels).not.toHaveBeenCalled();
  });

  it('returns success executed true and updates labels when size differs from sizedLabelOnIssue', async () => {
    mockGetSizeCategoryAndReason.mockResolvedValue({
      size: 'size: L',
      githubSize: 'L',
      reason: 'Many lines changed',
    });
    mockSetLabels.mockResolvedValue(undefined);
    mockSetTaskSize.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('size: L') && s.includes('resized'))).toBe(true);
    expect(mockSetLabels).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.arrayContaining(['feature', 'size: L']),
      't'
    );
  });

  it('returns failure when getSizeCategoryAndReason throws', async () => {
    mockGetSizeCategoryAndReason.mockRejectedValue(new Error('API error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain(
      'Tried to check the size of the changes, but there was a problem.'
    );
  });

  it('returns empty when baseBranch cannot be determined (parentBranch and development empty)', async () => {
    const param = baseParam({
      currentConfiguration: { parentBranch: '' },
      branches: { development: '' },
    });

    const results = await useCase.invoke(param);

    expect(results).toEqual([]);
    expect(mockGetSizeCategoryAndReason).not.toHaveBeenCalled();
  });

  it('updates labels on open PRs when size differs and getOpenPullRequestNumbersByHeadBranch returns PRs', async () => {
    mockGetSizeCategoryAndReason.mockResolvedValue({
      size: 'size: L',
      githubSize: 'L',
      reason: 'Many lines',
    });
    mockSetLabels.mockResolvedValue(undefined);
    mockSetTaskSize.mockResolvedValue(undefined);
    mockGetLabels.mockResolvedValue(['feature']);
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([99]);
    const mockGetProjects = jest.fn().mockReturnValue([{ id: 'proj1' }]);
    const param = baseParam({
      project: { getProjects: mockGetProjects },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('1 open PR(s)'))).toBe(true);
    expect(mockGetLabels).toHaveBeenCalledWith('o', 'r', 99, 't');
    expect(mockSetLabels).toHaveBeenCalledWith(
      'o',
      'r',
      99,
      expect.arrayContaining(['feature', 'size: L']),
      't'
    );
    expect(mockSetTaskSize).toHaveBeenCalledWith(
      { id: 'proj1' },
      'o',
      'r',
      99,
      'L',
      't'
    );
  });
});
