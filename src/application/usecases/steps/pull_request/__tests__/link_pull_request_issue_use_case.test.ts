import { LinkPullRequestIssueUseCase } from '../link_pull_request_issue_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

jest.useFakeTimers();

const mockIsLinked = jest.fn();
const mockUpdateBaseBranch = jest.fn();
const mockUpdateDescription = jest.fn();
const mockWait = jest.fn((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

function baseParam() {
  return {
    owner: 'o',
    repo: 'r',
    issueNumber: 42,
    pullRequest: { number: 10, base: 'develop', body: 'PR body', url: 'https://github.com/o/r/pull/10' },
    branches: { defaultBranch: 'main' },
    tokens: { token: 't' },
  } as unknown as Parameters<LinkPullRequestIssueUseCase['invoke']>[0];
}

describe('LinkPullRequestIssueUseCase', () => {
  let useCase: LinkPullRequestIssueUseCase;

  beforeEach(() => {
    useCase = new LinkPullRequestIssueUseCase(
      { isLinked: mockIsLinked, updateBaseBranch: mockUpdateBaseBranch, updateDescription: mockUpdateDescription },
      { wait: mockWait },
    );
    mockIsLinked.mockResolvedValue(false);
    mockUpdateBaseBranch.mockResolvedValue(undefined);
    mockUpdateDescription.mockResolvedValue(undefined);
    mockUpdateBaseBranch.mockClear();
    mockWait.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates base branch, description, waits, reverts base and description when PR is not linked', async () => {
    const param = baseParam();
    const promise = useCase.invoke(param);
    await jest.advanceTimersByTimeAsync(20000);
    const results = await promise;
    expect(mockIsLinked).toHaveBeenCalledWith('https://github.com/o/r/pull/10');
    expect(mockUpdateBaseBranch).toHaveBeenCalledWith('o', 'r', 10, 'main', 't');
    expect(mockUpdateDescription).toHaveBeenCalledWith('o', 'r', 10, expect.stringContaining('Resolves #42'), 't');
    expect(mockUpdateBaseBranch).toHaveBeenCalledWith('o', 'r', 10, 'develop', 't');
    expect(results.some((r) => r.success && r.steps?.length)).toBe(true);
  });

  it('returns without actions when isLinked returns true', async () => {
    mockIsLinked.mockResolvedValue(true);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });

  it('returns failure on error', async () => {
    mockIsLinked.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.success === false)).toBe(true);
  });
});
