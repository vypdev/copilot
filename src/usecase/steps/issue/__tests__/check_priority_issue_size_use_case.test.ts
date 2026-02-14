import { ProjectDetail } from '../../../../data/model/project_detail';
import { CheckPriorityIssueSizeUseCase } from '../check_priority_issue_size_use_case';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

const mockSetTaskPriority = jest.fn();
jest.mock('../../../../data/repository/project_repository', () => ({
  ProjectRepository: jest.fn().mockImplementation(() => ({
    setTaskPriority: mockSetTaskPriority,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    issueNumber: 1,
    tokens: { token: 't' },
    labels: {
      priorityLabelOnIssue: 'P0',
      priorityLabelOnIssueProcessable: true,
      priorityHigh: 'P0',
      priorityMedium: 'P1',
      priorityLow: 'P2',
    },
    project: { getProjects: () => [{ id: 'p1', title: 'Board' }] },
    ...overrides,
  } as unknown as Parameters<CheckPriorityIssueSizeUseCase['invoke']>[0];
}

describe('CheckPriorityIssueSizeUseCase', () => {
  let useCase: CheckPriorityIssueSizeUseCase;

  beforeEach(() => {
    useCase = new CheckPriorityIssueSizeUseCase();
    mockSetTaskPriority.mockReset();
  });

  it('returns success executed false when priorityLabelOnIssueProcessable is false', async () => {
    const param = baseParam({
      labels: {
        priorityLabelOnIssue: 'P0',
        priorityLabelOnIssueProcessable: false,
        priorityHigh: 'P0',
        priorityMedium: 'P1',
        priorityLow: 'P2',
      },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockSetTaskPriority).not.toHaveBeenCalled();
  });

  it('returns success executed false when project has no projects', async () => {
    const param = baseParam({ project: { getProjects: () => [] } });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockSetTaskPriority).not.toHaveBeenCalled();
  });

  it('returns success executed false when priority is not high/medium/low', async () => {
    const param = baseParam({
      labels: {
        priorityLabelOnIssue: 'other',
        priorityLabelOnIssueProcessable: true,
        priorityHigh: 'P0',
        priorityMedium: 'P1',
        priorityLow: 'P2',
      },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockSetTaskPriority).not.toHaveBeenCalled();
  });

  it('calls setTaskPriority and returns success when priority is P0', async () => {
    mockSetTaskPriority.mockResolvedValue(true);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockSetTaskPriority).toHaveBeenCalled();
    expect(results[0].steps?.some((s) => s.includes('P0'))).toBe(true);
  });

  it('returns failure when setTaskPriority throws', async () => {
    mockSetTaskPriority.mockRejectedValue(new Error('API error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('priority'))).toBe(true);
  });

  it('sets P1 when priority is priorityMedium', async () => {
    mockSetTaskPriority.mockResolvedValue(true);
    const param = baseParam({
      labels: {
        priorityLabelOnIssue: 'P1',
        priorityLabelOnIssueProcessable: true,
        priorityHigh: 'P0',
        priorityMedium: 'P1',
        priorityLow: 'P2',
      },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockSetTaskPriority).toHaveBeenCalled();
  });

  it('sets P2 when priority is priorityLow', async () => {
    mockSetTaskPriority.mockResolvedValue(true);
    const param = baseParam({
      labels: {
        priorityLabelOnIssue: 'P2',
        priorityLabelOnIssueProcessable: true,
        priorityHigh: 'P0',
        priorityMedium: 'P1',
        priorityLow: 'P2',
      },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockSetTaskPriority).toHaveBeenCalled();
  });

  it('step message contains built project URL when project has no url', async () => {
    mockSetTaskPriority.mockResolvedValue(true);
    const projectNoUrl = new ProjectDetail({
      id: 'p1',
      title: 'Board',
      type: 'user',
      owner: 'jane',
      url: '',
      number: 2,
    });
    const param = baseParam({
      project: { getProjects: () => [projectNoUrl] },
    });

    const results = await useCase.invoke(param);

    const builtUrl = 'https://github.com/users/jane/projects/2';
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes(builtUrl))).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('[Board]'))).toBe(true);
  });
});
