import { CheckChangesIssueSizeUseCase } from '../check_changes_issue_size_use_case';
import { projectChangeSizeContext } from '../../../push_single_action_contexts';

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
const mockIsContentLinked = jest.fn();


function baseParam(overrides: Record<string, unknown> = {}) {
  return projectChangeSizeContext({
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
      sizeXxl: 'size: XXL',
      sizeXl: 'size: XL',
      sizeL: 'size: L',
      sizeM: 'size: M',
      sizeS: 'size: S',
      sizeXs: 'size: XS',
    },
    project: { getProjects: () => [] },
    ...overrides,
  } as never);
}

describe('CheckChangesIssueSizeUseCase', () => {
  let useCase: CheckChangesIssueSizeUseCase;

  beforeEach(() => {
    useCase = new CheckChangesIssueSizeUseCase(
      { setTaskSize: mockSetTaskSize } as any,
      { setLabels: mockSetLabels, getLabels: mockGetLabels } as any,
      { getOpenPullRequestNumbersByHeadBranch: mockGetOpenPullRequestNumbersByHeadBranch } as any,
      { getSizeCategoryAndReason: mockGetSizeCategoryAndReason } as any,
      { isContentLinked: mockIsContentLinked },
    );
    mockGetSizeCategoryAndReason.mockReset();
    mockSetLabels.mockReset();
    mockSetTaskSize.mockReset();
    mockGetLabels.mockReset();
    mockIsContentLinked.mockReset().mockResolvedValue(true);
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
      'feature/42-foo',
      'develop',
      expect.anything(),
      expect.anything(),
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
      42,
      expect.arrayContaining(['feature', 'size: L']),
    );
  });

  it('returns failure when getSizeCategoryAndReason throws', async () => {
    mockGetSizeCategoryAndReason.mockRejectedValue(new Error('API error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain(
      'Size reconciliation stopped; completed effects were retained. Inspect the failed operation before retrying.'
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
    expect(mockGetLabels).toHaveBeenCalledWith(99);
    expect(mockSetLabels).toHaveBeenCalledWith(
      99,
      expect.arrayContaining(['feature', 'size: L']),
    );
    expect(mockSetTaskSize).toHaveBeenCalledWith(
      { id: 'proj1' },
      99,
      'L',
    );
  });

  it('retains successful issue and PR labels while a newly opened PR awaits Project linkage', async () => {
    mockGetSizeCategoryAndReason.mockResolvedValue({ size: 'size: L', githubSize: 'L', reason: 'Many lines' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([99]);
    mockGetLabels.mockResolvedValue(['feature']);
    mockIsContentLinked.mockResolvedValue(false);
    const results = await useCase.invoke(baseParam({ project: { getProjects: () => [{ id: 'proj1' }] } }));
    expect(results[0].success).toBe(true);
    expect(results[0].payload).toEqual({ changeSize: { pendingProjectSizes: [{ pullRequestNumber: 99, projectId: 'proj1' }] } });
    expect(results[0].steps?.join(' ')).toContain('pending');
    expect(mockSetTaskSize).toHaveBeenCalledTimes(1);
    expect(mockSetTaskSize).toHaveBeenCalledWith({ id: 'proj1' }, 42, 'L');
    expect(mockSetLabels).toHaveBeenCalledWith(99, ['feature', 'size: L']);
  });

  it('retries PR Project size after linkage even when the issue already has the computed size', async () => {
    mockGetSizeCategoryAndReason.mockResolvedValue({ size: 'size: M', githubSize: 'M', reason: 'Within limits' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([99]);
    mockGetLabels.mockResolvedValue(['feature', 'size: M']);
    const results = await useCase.invoke(baseParam({ project: { getProjects: () => [{ id: 'proj1' }] } }));
    expect(results[0].success).toBe(true);
    expect(mockSetLabels).not.toHaveBeenCalled();
    expect(mockSetTaskSize).toHaveBeenCalledWith({ id: 'proj1' }, 99, 'M');
    expect(results[0].payload).toEqual({ changeSize: { pendingProjectSizes: [] } });
  });

  it('reports unavailable membership as failure rather than claiming a pending link', async () => {
    mockGetSizeCategoryAndReason.mockResolvedValue({ size: 'size: L', githubSize: 'L', reason: 'Many lines' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([99]);
    mockGetLabels.mockResolvedValue(['feature']);
    mockIsContentLinked.mockRejectedValue(new Error('403 forbidden'));
    const results = await useCase.invoke(baseParam({ project: { getProjects: () => [{ id: 'proj1' }] } }));
    expect(results[0].success).toBe(false);
    expect(results[0].steps?.join(' ')).not.toContain('pending');
    expect(mockSetTaskSize).not.toHaveBeenCalledWith({ id: 'proj1' }, 99, expect.anything());
  });
});
