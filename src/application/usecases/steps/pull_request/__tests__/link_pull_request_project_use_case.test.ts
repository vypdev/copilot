import { LinkPullRequestProjectUseCase } from '../link_pull_request_project_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const mockLinkContentId = jest.fn();
const mockMoveIssueToColumn = jest.fn();
const mockWait = jest.fn((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
jest.mock('../../../../../data/repository/project/project_board_query_repository', () => ({
  ProjectBoardQueryRepository: jest.fn().mockImplementation(() => ({
    linkContentId: mockLinkContentId,
    moveIssueToColumn: mockMoveIssueToColumn,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    pullRequest: { number: 10, id: 'pr-node-1' },
    tokens: { token: 't' },
    project: {
      getProjects: () => [{ id: 'p1', title: 'Backlog', url: 'https://github.com/org/repo/projects/1' }],
      getProjectColumnPullRequestCreated: () => 'To Do',
    },
    ...overrides,
  } as unknown as Parameters<LinkPullRequestProjectUseCase['invoke']>[0];
}

describe('LinkPullRequestProjectUseCase', () => {
  let useCase: LinkPullRequestProjectUseCase;

  beforeEach(() => {
    jest.useFakeTimers();
    useCase = new LinkPullRequestProjectUseCase(
      { moveIssueToColumn: mockMoveIssueToColumn, setTaskPriority: jest.fn(), setTaskSize: jest.fn() },
      { linkContentId: mockLinkContentId },
      { wait: mockWait },
    );
    mockLinkContentId.mockResolvedValue(true);
    mockMoveIssueToColumn.mockResolvedValue(true);
    mockWait.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('links PR to project and moves to column', async () => {
    const param = baseParam();
    const promise = useCase.invoke(param);
    await jest.advanceTimersByTimeAsync(10000);
    const results = await promise;
    expect(mockLinkContentId).toHaveBeenCalledWith(expect.any(Object), 'pr-node-1', 't');
    expect(mockMoveIssueToColumn).toHaveBeenCalledWith(
      expect.any(Object),
      'o',
      'r',
      10,
      'To Do',
      't'
    );
    expect(results.some((r) => r.success && r.steps?.some((s) => s.includes('Backlog')))).toBe(true);
  });

  it('returns failure when moveIssueToColumn returns false', async () => {
    mockMoveIssueToColumn.mockResolvedValue(false);
    const param = baseParam();
    const promise = useCase.invoke(param);
    await jest.advanceTimersByTimeAsync(10000);
    const results = await promise;
    expect(results.some((r) => r.success === false && r.steps?.some((s) => s.includes('error moving')))).toBe(true);
  });

  it('pushes no result when linkContentId returns false', async () => {
    mockLinkContentId.mockReset();
    mockLinkContentId.mockResolvedValue(false);
    mockMoveIssueToColumn.mockClear();
    const param = baseParam();
    const promise = useCase.invoke(param);
    await jest.advanceTimersByTimeAsync(10000);
    const results = await promise;
    expect(mockLinkContentId).toHaveBeenCalled();
    expect(mockMoveIssueToColumn).not.toHaveBeenCalled();
    expect(results).toHaveLength(0);
  });

  it('returns failure on error', async () => {
    mockLinkContentId.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.success === false)).toBe(true);
  });
});
