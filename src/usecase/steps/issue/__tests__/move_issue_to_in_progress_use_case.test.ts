import { ProjectDetail } from '../../../../data/model/project_detail';
import { MoveIssueToInProgressUseCase } from '../move_issue_to_in_progress';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockMoveIssueToColumn = jest.fn();
jest.mock('../../../../data/repository/project_repository', () => ({
  ProjectRepository: jest.fn().mockImplementation(() => ({
    moveIssueToColumn: mockMoveIssueToColumn,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    issueNumber: 42,
    tokens: { token: 't' },
    project: {
      getProjects: () => [{ id: 'p1', title: 'Backlog', url: 'https://github.com/org/repo/projects/1' }],
      getProjectColumnIssueInProgress: () => 'In Progress',
    },
    ...overrides,
  } as unknown as Parameters<MoveIssueToInProgressUseCase['invoke']>[0];
}

describe('MoveIssueToInProgressUseCase', () => {
  let useCase: MoveIssueToInProgressUseCase;

  beforeEach(() => {
    useCase = new MoveIssueToInProgressUseCase();
    mockMoveIssueToColumn.mockResolvedValue(true);
  });

  it('moves issue to in-progress column and returns success', async () => {
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockMoveIssueToColumn).toHaveBeenCalledWith(
      expect.any(Object),
      'o',
      'r',
      42,
      'In Progress',
      't'
    );
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('In Progress'))).toBe(true);
  });

  it('returns failure when moveIssueToColumn throws', async () => {
    mockMoveIssueToColumn.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.length).toBeGreaterThan(0);
  });

  it('returns no success result when moveIssueToColumn returns false', async () => {
    mockMoveIssueToColumn.mockResolvedValue(false);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(0);
  });

  it('returns failure with step message when moveIssueToColumn throws', async () => {
    mockMoveIssueToColumn.mockRejectedValue(new Error('Column API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('problem'))).toBe(true);
  });

  it('step message contains built project URL when project has no url', async () => {
    const projectNoUrl = new ProjectDetail({
      id: 'p1',
      title: 'Backlog',
      type: 'organization',
      owner: 'acme',
      url: '',
      number: 3,
    });
    const param = baseParam({
      project: {
        getProjects: () => [projectNoUrl],
        getProjectColumnIssueInProgress: () => 'In Progress',
      },
    });
    const results = await useCase.invoke(param);
    const builtUrl = 'https://github.com/orgs/acme/projects/3';
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes(builtUrl))).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('[Backlog]'))).toBe(true);
  });
});
