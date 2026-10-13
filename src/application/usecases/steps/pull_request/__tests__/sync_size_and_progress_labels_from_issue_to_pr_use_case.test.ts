import { SyncSizeAndProgressLabelsFromIssueToPrUseCase } from '../sync_size_and_progress_labels_from_issue_to_pr_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGetLabels = jest.fn();
const mockSetLabels = jest.fn();


const defaultSizeLabels = ['size: XS', 'size: S', 'size: M', 'size: L', 'size: XL', 'size: XXL'];

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    issueNumber: 287,
    pullRequestNumber: 100,
    sizeLabels: defaultSizeLabels,
    projects: [],
    projectSizeByLabel: { 'size: XS': 'XS', 'size: S': 'S', 'size: M': 'M', 'size: L': 'L', 'size: XL': 'XL', 'size: XXL': 'XL' },
    ...overrides,
  } as unknown as Parameters<SyncSizeAndProgressLabelsFromIssueToPrUseCase['invoke']>[0];
}

describe('SyncSizeAndProgressLabelsFromIssueToPrUseCase', () => {
  let useCase: SyncSizeAndProgressLabelsFromIssueToPrUseCase;

  beforeEach(() => {
    useCase = new SyncSizeAndProgressLabelsFromIssueToPrUseCase({ getLabels: mockGetLabels, setLabels: mockSetLabels });
    mockGetLabels.mockReset();
    mockSetLabels.mockReset();
  });

  it.each([-1, 100, Number.MAX_SAFE_INTEGER + 1, Number.NaN])('returns executed false when no separate safe issue is linked: %s', async (issueNumber) => {
    const param = baseParam({ issueNumber });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(results[0].steps).toContain('No issue linked; size/progress labels not synced.');
    expect(mockGetLabels).not.toHaveBeenCalled();
  });

  it('returns executed true with no sync when issue has no size or progress labels', async () => {
    mockGetLabels.mockResolvedValue(['bug', 'feature']);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toContain('Issue has no size/progress labels to sync.');
    expect(mockSetLabels).not.toHaveBeenCalled();
  });

  it('copies only progress label to PR', async () => {
    mockGetLabels
      .mockResolvedValueOnce(['bug', '50%'])
      .mockResolvedValueOnce(['bug']);
    mockSetLabels.mockResolvedValue(undefined);
    const param = baseParam({ issueNumber: 287, pullRequestNumber: 100 });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toEqual([]);
    expect(mockSetLabels).toHaveBeenCalledWith(
      100,
      expect.arrayContaining(['bug', '50%']),
    );
  });

  it('copies only size label to PR', async () => {
    mockGetLabels
      .mockResolvedValueOnce(['bug', 'size: M'])
      .mockResolvedValueOnce(['bug']);
    mockSetLabels.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toEqual([]);
    expect(mockSetLabels).toHaveBeenCalledWith(
      100,
      expect.arrayContaining(['bug', 'size: M']),
    );
  });

  it('copies both size and progress labels to PR', async () => {
    mockGetLabels
      .mockResolvedValueOnce(['bug', 'size: M', '50%'])
      .mockResolvedValueOnce(['bug']);
    mockSetLabels.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toEqual([]);
    expect(mockSetLabels).toHaveBeenCalledWith(
      100,
      expect.arrayContaining(['bug', 'size: M', '50%']),
    );
  });

  it('returns failure when setLabels throws', async () => {
    mockGetLabels
      .mockResolvedValueOnce(['50%'])
      .mockResolvedValueOnce([]);
    mockSetLabels.mockRejectedValue(new Error('API error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Failed to sync size/progress labels from issue to PR.');
  });

  it('returns failure when getLabels throws', async () => {
    mockGetLabels.mockRejectedValue(new Error('Network error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Failed to sync size/progress labels from issue to PR.');
  });

  const project = { id: 'p1', title: 'Board', type: 'organization', owner: 'org', url: 'https://github.com/orgs/org/projects/1', number: 1 };
  function postLink(labels: string[], prLabels: string[] = []) {
    mockGetLabels.mockResolvedValueOnce(labels).mockResolvedValueOnce(prLabels);
    const setTaskSize = jest.fn().mockResolvedValue(true);
    const isContentLinked = jest.fn().mockResolvedValue(true);
    return { setTaskSize, isContentLinked, useCase: new SyncSizeAndProgressLabelsFromIssueToPrUseCase(
      { getLabels: mockGetLabels, setLabels: mockSetLabels }, { setTaskSize }, { isContentLinked },
    ), param: baseParam({ projects: [project] }) };
  }

  it.each([['tiny', 'XS'], ['small', 'S'], ['medium', 'M'], ['large', 'L'], ['huge', 'XL'], ['largest', 'XL']])(
    'reconciles deferred Project Size from a fresh custom issue label without another push: %s', async (label, size) => {
      const h = postLink([label]);
      h.param = baseParam({ projects: [project], sizeLabels: [label], projectSizeByLabel: { [label]: size } });
      expect((await h.useCase.invoke(h.param))[0].success).toBe(true);
      expect(h.isContentLinked).toHaveBeenCalledWith(project, 100);
      expect(h.setTaskSize).toHaveBeenCalledWith(project, 100, size);
    },
  );

  it('repairs Project Size on replay without rewriting already correct PR labels', async () => {
    const h = postLink(['size: M', '50%'], ['bug', 'size: M', '50%']);
    expect((await h.useCase.invoke(h.param))[0].success).toBe(true);
    expect(mockSetLabels).not.toHaveBeenCalled();
    expect(h.setTaskSize).toHaveBeenCalledWith(project, 100, 'M');
  });

  it('preserves progress-only sync without writing a Project Size', async () => {
    const h = postLink(['50%']);
    expect((await h.useCase.invoke(h.param))[0].success).toBe(true);
    expect(h.isContentLinked).not.toHaveBeenCalled();
    expect(h.setTaskSize).not.toHaveBeenCalled();
  });

  it('accepts an already-correct Project Size without reporting a provider failure', async () => {
    const h = postLink(['size: M']);
    h.setTaskSize.mockResolvedValue(false);
    expect((await h.useCase.invoke(h.param))[0].success).toBe(true);
    expect(h.setTaskSize).toHaveBeenCalledWith(project, 100, 'M');
  });

  it.each(['denied', 'absent', 'write-throw'])('retains failure evidence after labels are synced: %s', async (failure) => {
    const h = postLink(['size: M']);
    if (failure === 'denied') h.isContentLinked.mockRejectedValue(new Error('denied'));
    else if (failure === 'absent') h.isContentLinked.mockResolvedValue(false);
    else h.setTaskSize.mockRejectedValue(new Error('write failed'));
    expect((await h.useCase.invoke(h.param))[0].success).toBe(false);
    expect(mockSetLabels).toHaveBeenCalledWith(100, ['size: M']);
    if (failure === 'denied' || failure === 'absent') expect(h.setTaskSize).not.toHaveBeenCalled();
  });

  it('refuses ambiguous issue size labels before mutating PR metadata', async () => {
    const h = postLink(['size: M', 'size: L']);
    expect((await h.useCase.invoke(h.param))[0].success).toBe(false);
    expect(mockSetLabels).not.toHaveBeenCalled();
    expect(h.setTaskSize).not.toHaveBeenCalled();
  });

  it('fails without the required Project authority rather than claiming reconciliation', async () => {
    const h = postLink(['size: M']);
    const labelsOnly = new SyncSizeAndProgressLabelsFromIssueToPrUseCase({ getLabels: mockGetLabels, setLabels: mockSetLabels });
    expect((await labelsOnly.invoke(h.param))[0].success).toBe(false);
  });

  it('fails without membership read authority even when Size write authority exists', async () => {
    const h = postLink(['size: M']);
    const noMembership = new SyncSizeAndProgressLabelsFromIssueToPrUseCase(
      { getLabels: mockGetLabels, setLabels: mockSetLabels }, { setTaskSize: h.setTaskSize },
    );
    expect((await noMembership.invoke(h.param))[0].success).toBe(false);
    expect(h.setTaskSize).not.toHaveBeenCalled();
  });

  it('reconciles each configured Project only after its own membership is verified', async () => {
    const h = postLink(['size: M']);
    const other = { ...project, id: 'p2', number: 2 };
    h.param = baseParam({ projects: [project, other] });
    expect((await h.useCase.invoke(h.param))[0].success).toBe(true);
    expect(h.isContentLinked).toHaveBeenCalledTimes(2);
    expect(h.setTaskSize).toHaveBeenNthCalledWith(1, project, 100, 'M');
    expect(h.setTaskSize).toHaveBeenNthCalledWith(2, other, 100, 'M');
  });
});
