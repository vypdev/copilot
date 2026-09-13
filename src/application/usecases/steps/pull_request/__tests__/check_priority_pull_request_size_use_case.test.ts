import { ProjectDetail } from '../../../../../data/model/project_detail';
import { CheckPriorityPullRequestSizeUseCase } from '../check_priority_pull_request_size_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

const mockSetTaskPriority = jest.fn();
jest.mock('../../../../../data/repository/project/project_board_query_repository', () => ({
  ProjectBoardQueryRepository: jest.fn().mockImplementation(() => ({
    setTaskPriority: mockSetTaskPriority,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    contentNumber: 2,
    priority: {
      currentLabel: 'P1',
      processable: true,
      high: 'P0',
      medium: 'P1',
      low: 'P2',
    },
    projects: [{ id: 'p1', title: 'Board', type: 'organization', owner: 'org', url: 'https://github.com/orgs/org/projects/1', number: 1 }],
    ...overrides,
  } as unknown as Parameters<CheckPriorityPullRequestSizeUseCase['invoke']>[0];
}

describe('CheckPriorityPullRequestSizeUseCase', () => {
  let useCase: CheckPriorityPullRequestSizeUseCase;

  beforeEach(() => {
    useCase = new CheckPriorityPullRequestSizeUseCase({ setTaskPriority: mockSetTaskPriority });
    mockSetTaskPriority.mockReset();
  });

  it('returns success executed false when no projects', async () => {
    const param = baseParam({ projects: [] });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockSetTaskPriority).not.toHaveBeenCalled();
  });

  it('returns success executed false when priority not high/medium/low', async () => {
    const param = baseParam({
      priority: {
        currentLabel: 'other',
        processable: true,
        high: 'P0',
        medium: 'P1',
        low: 'P2',
      },
    });

    const results = await useCase.invoke(param);

    expect(results[0].executed).toBe(false);
  });

  it('calls setTaskPriority when priority is P0', async () => {
    mockSetTaskPriority.mockResolvedValue(true);
    const param = baseParam({
      priority: {
        currentLabel: 'P0',
        processable: true,
        high: 'P0',
        medium: 'P1',
        low: 'P2',
      },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('P0'))).toBe(true);
    expect(mockSetTaskPriority).toHaveBeenCalledWith(
      expect.any(Object),
      2,
      'P0',
    );
  });

  it('calls setTaskPriority when priority is P2', async () => {
    mockSetTaskPriority.mockResolvedValue(true);
    const param = baseParam({
      priority: {
        currentLabel: 'P2',
        processable: true,
        high: 'P0',
        medium: 'P1',
        low: 'P2',
      },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('P2'))).toBe(true);
    expect(mockSetTaskPriority).toHaveBeenCalledWith(
      expect.any(Object),
      2,
      'P2',
    );
  });

  it('calls setTaskPriority when priority is P1', async () => {
    mockSetTaskPriority.mockResolvedValue(true);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockSetTaskPriority).toHaveBeenCalled();
  });

  it('returns failure when priorityLabelOnIssueProcessable is false', async () => {
    const param = baseParam({
      priority: {
        currentLabel: 'P1',
        processable: false,
        high: 'P0',
        medium: 'P1',
        low: 'P2',
      },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockSetTaskPriority).not.toHaveBeenCalled();
  });

  it('returns failure when setTaskPriority throws', async () => {
    mockSetTaskPriority.mockRejectedValue(new Error('API error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toContain('Tried to check the priority of the issue, but there was a problem.');
  });

  it('step message contains built project URL when project has no url', async () => {
    mockSetTaskPriority.mockResolvedValue(true);
    const projectNoUrl = new ProjectDetail({
      id: 'p1',
      title: 'Sprint',
      type: 'organization',
      owner: 'acme',
      url: '',
      number: 5,
    });
    const param = baseParam({
      projects: [{ ...projectNoUrl, url: projectNoUrl.publicUrl }],
    });

    const results = await useCase.invoke(param);

    const builtUrl = 'https://github.com/orgs/acme/projects/5';
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes(builtUrl))).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('[Sprint]'))).toBe(true);
  });
});
