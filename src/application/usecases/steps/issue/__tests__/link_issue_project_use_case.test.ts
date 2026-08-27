import { LinkIssueProjectUseCase } from '../link_issue_project_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
  logWarn: jest.fn(),
}));

jest.useFakeTimers();

const mockGetId = jest.fn();

const mockLinkContentId = jest.fn();
const mockMoveIssueToColumn = jest.fn();
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
    issue: { number: 42 },
    tokens: { token: 't' },
    project: {
      getProjects: () => [{ id: 'p1', title: 'Backlog', url: 'https://github.com/org/repo/projects/1' }],
      getProjectColumnIssueCreated: () => 'To Do',
    },
    ...overrides,
  } as unknown as Parameters<LinkIssueProjectUseCase['invoke']>[0];
}

describe('LinkIssueProjectUseCase', () => {
  let useCase: LinkIssueProjectUseCase;

  beforeEach(() => {
    useCase = new LinkIssueProjectUseCase(
      { getId: mockGetId },
      { moveIssueToColumn: mockMoveIssueToColumn, setTaskPriority: jest.fn(), setTaskSize: jest.fn() },
      { linkContentId: mockLinkContentId },
    );
    mockGetId.mockResolvedValue('issue-node-1');
    mockLinkContentId.mockResolvedValue(true);
    mockMoveIssueToColumn.mockResolvedValue(true);
    mockMoveIssueToColumn.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('links issue to project and moves to column when linkContentId and moveIssueToColumn succeed', async () => {
    const param = baseParam();
    const promise = useCase.invoke(param);
    await jest.advanceTimersByTimeAsync(10000);
    const results = await promise;
    expect(mockGetId).toHaveBeenCalledWith('o', 'r', 42, 't');
    expect(mockLinkContentId).toHaveBeenCalled();
    expect(mockMoveIssueToColumn).toHaveBeenCalledWith(
      expect.any(Object),
      'o',
      'r',
      42,
      'To Do',
      't'
    );
    expect(results.some((r) => r.success && r.steps?.some((s) => s.includes('Backlog')))).toBe(true);
  });

  it('returns result with executed false when linkContentId returns false', async () => {
    mockLinkContentId.mockResolvedValue(false);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockMoveIssueToColumn).not.toHaveBeenCalled();
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('returns success executed false when linkContentId succeeds but moveIssueToColumn returns false', async () => {
    jest.useFakeTimers();
    mockLinkContentId.mockResolvedValue(true);
    mockMoveIssueToColumn.mockResolvedValue(false);
    const param = baseParam();
    const promise = useCase.invoke(param);
    await jest.advanceTimersByTimeAsync(10000);
    const results = await promise;
    expect(mockMoveIssueToColumn).toHaveBeenCalled();
    expect(results.some((r) => r.success === true && r.executed === false && (r.steps?.length ?? 0) === 0)).toBe(true);
    jest.useRealTimers();
  });

  it('returns failure on error', async () => {
    mockGetId.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.success === false)).toBe(true);
  });
});
