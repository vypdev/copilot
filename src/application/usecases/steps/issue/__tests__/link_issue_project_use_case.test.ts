import { LinkIssueProjectUseCase } from '../link_issue_project_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const mockGetId = jest.fn();
const mockLinkContentId = jest.fn();
const mockMoveContent = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    contentType: 'issue',
    contentNumber: 42,
    columnName: 'To Do',
    projects: [{ id: 'p1', title: 'Backlog', type: 'organization', owner: 'org', url: 'https://github.com/org/repo/projects/1', number: 1 }],
    ...overrides,
  } as unknown as Parameters<LinkIssueProjectUseCase['invoke']>[0];
}

describe('LinkIssueProjectUseCase', () => {
  let useCase: LinkIssueProjectUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new LinkIssueProjectUseCase({
      resolveIssueContentId: mockGetId,
      linkContentId: mockLinkContentId,
      moveContent: mockMoveContent,
    });
    mockGetId.mockResolvedValue('issue-node-1');
    mockLinkContentId.mockResolvedValue('project-item-1');
    mockMoveContent.mockResolvedValue(true);
  });

  it('uses the authoritative project item ID to set the configured status immediately', async () => {
    const results = await useCase.invoke(baseParam());

    expect(mockGetId).toHaveBeenCalledWith(42);
    expect(mockLinkContentId).toHaveBeenCalledWith(expect.any(Object), 'issue-node-1');
    expect(mockMoveContent).toHaveBeenCalledWith(expect.any(Object), 'project-item-1', 'To Do');
    expect(results).toEqual([expect.objectContaining({
      success: true,
      executed: true,
      steps: [expect.stringContaining('with status `To Do`')],
    })]);
  });

  it('returns a failure when linking does not yield a usable project item', async () => {
    mockLinkContentId.mockRejectedValue(new Error('GitHub returned no item'));

    const results = await useCase.invoke(baseParam());

    expect(mockMoveContent).not.toHaveBeenCalled();
    expect(results).toEqual([expect.objectContaining({ success: false, executed: true })]);
  });

  it('skips provider calls when no projects are configured', async () => {
    const results = await useCase.invoke(baseParam({ projects: [] }));

    expect(results).toEqual([]);
    expect(mockGetId).not.toHaveBeenCalled();
    expect(mockLinkContentId).not.toHaveBeenCalled();
    expect(mockMoveContent).not.toHaveBeenCalled();
  });

  it('reports the retained link when setting the project status fails', async () => {
    mockMoveContent.mockResolvedValue(false);

    const results = await useCase.invoke(baseParam());

    expect(results).toEqual([expect.objectContaining({
      success: false,
      executed: true,
      steps: [expect.stringContaining('status could not be set')],
    })]);
  });

  it('returns failure when resolving the issue content ID fails', async () => {
    mockGetId.mockRejectedValue(new Error('API error'));

    const results = await useCase.invoke(baseParam());

    expect(results).toEqual([expect.objectContaining({ success: false })]);
  });
});
