import { ProjectDetail } from '../../../../../data/model/project_detail';
import { CheckPriorityIssueSizeUseCase } from '../check_priority_issue_size_use_case';

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
    contentNumber: 1,
    priority: {
      currentLabel: 'P0',
      processable: true,
      high: 'P0',
      medium: 'P1',
      low: 'P2',
    },
    projects: [{ id: 'p1', title: 'Board', type: 'organization', owner: 'org', url: 'https://github.com/orgs/org/projects/1', number: 1 }],
    ...overrides,
  } as unknown as Parameters<CheckPriorityIssueSizeUseCase['invoke']>[0];
}

describe('CheckPriorityIssueSizeUseCase', () => {
  let useCase: CheckPriorityIssueSizeUseCase;

  beforeEach(() => {
    useCase = new CheckPriorityIssueSizeUseCase({ setTaskPriority: mockSetTaskPriority });
    mockSetTaskPriority.mockReset();
  });

  it('returns success executed false when priorityLabelOnIssueProcessable is false', async () => {
    const param = baseParam({
      priority: {
        currentLabel: 'P0',
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

  it('returns success executed false when project has no projects', async () => {
    const param = baseParam({ projects: [] });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockSetTaskPriority).not.toHaveBeenCalled();
  });

  it('returns success executed false when priority is not high/medium/low', async () => {
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
      priority: {
        currentLabel: 'P1',
        processable: true,
        high: 'P0',
        medium: 'P1',
        low: 'P2',
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
      projects: [{ ...projectNoUrl, url: projectNoUrl.publicUrl }],
    });

    const results = await useCase.invoke(param);

    const builtUrl = 'https://github.com/users/jane/projects/2';
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes(builtUrl))).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('[Board]'))).toBe(true);
  });
});
