import { ProjectDetail } from '../../../../data/model/project_detail';
import { CheckPriorityPullRequestSizeUseCase } from '../check_priority_pull_request_size_use_case';

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
    pullRequest: { number: 2 },
    tokens: { token: 't' },
    labels: {
      priorityLabelOnIssue: 'P1',
      priorityLabelOnIssueProcessable: true,
      priorityHigh: 'P0',
      priorityMedium: 'P1',
      priorityLow: 'P2',
    },
    project: { getProjects: () => [{ id: 'p1', title: 'Board' }] },
    ...overrides,
  } as unknown as Parameters<CheckPriorityPullRequestSizeUseCase['invoke']>[0];
}

describe('CheckPriorityPullRequestSizeUseCase', () => {
  let useCase: CheckPriorityPullRequestSizeUseCase;

  beforeEach(() => {
    useCase = new CheckPriorityPullRequestSizeUseCase();
    mockSetTaskPriority.mockReset();
  });

  it('returns success executed false when no projects', async () => {
    const param = baseParam({ project: { getProjects: () => [] } });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockSetTaskPriority).not.toHaveBeenCalled();
  });

  it('returns success executed false when priority not high/medium/low', async () => {
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

    expect(results[0].executed).toBe(false);
  });

  it('calls setTaskPriority when priority is P0', async () => {
    mockSetTaskPriority.mockResolvedValue(true);
    const param = baseParam({
      labels: {
        priorityLabelOnIssue: 'P0',
        priorityLabelOnIssueProcessable: true,
        priorityHigh: 'P0',
        priorityMedium: 'P1',
        priorityLow: 'P2',
      },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('P0'))).toBe(true);
    expect(mockSetTaskPriority).toHaveBeenCalledWith(
      expect.any(Object),
      'o',
      'r',
      2,
      'P0',
      't'
    );
  });

  it('calls setTaskPriority when priority is P2', async () => {
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
    expect(results[0].steps?.some((s) => s.includes('P2'))).toBe(true);
    expect(mockSetTaskPriority).toHaveBeenCalledWith(
      expect.any(Object),
      'o',
      'r',
      2,
      'P2',
      't'
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
      labels: {
        priorityLabelOnIssue: 'P1',
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
      project: { getProjects: () => [projectNoUrl] },
    });

    const results = await useCase.invoke(param);

    const builtUrl = 'https://github.com/orgs/acme/projects/5';
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes(builtUrl))).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('[Sprint]'))).toBe(true);
  });
});
