import { DeployAddedUseCase } from '../label_deploy_added_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockMoveIssueToColumn = jest.fn();
const mockMoveIssueInvoke = jest.fn();
const mockExecuteWorkflow = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    issue: {
      labeled: true,
      labelAdded: 'deploy',
      number: 42,
      title: 'Add feature',
      body: '## Changelog\n- Item',
    },
    deployLabel: 'deploy',
    release: { active: true, branch: 'release/1.0', version: '1.0.0' },
    hotfix: { active: false },
    workflows: { release: 'release.yml', hotfix: 'hotfix.yml' },
    repositoryWebUrl: 'https://github.com/o/r',
    moveToInProgress: { issueNumber: 42, columnName: 'In Progress', projects: [] },
    ...overrides,
  } as unknown as Parameters<DeployAddedUseCase['invoke']>[0];
}

describe('DeployAddedUseCase (label_deploy_added)', () => {
  let useCase: DeployAddedUseCase;

  beforeEach(() => {
    useCase = new DeployAddedUseCase(
      { executeWorkflow: mockExecuteWorkflow },
      { taskId: 'MoveIssueToInProgressUseCase', invoke: mockMoveIssueInvoke },
    );
    mockMoveIssueInvoke.mockResolvedValue([]);
    mockMoveIssueToColumn.mockResolvedValue(true);
    mockExecuteWorkflow.mockResolvedValue(undefined);
  });

  it('returns executed false when labeled is false or labelAdded is not deploy', async () => {
    const param = baseParam({ issue: { labeled: false, labelAdded: '', title: '', body: '' } });
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.executed === false)).toBe(true);
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });

  it('executes release workflow when release active and branch set', async () => {
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(mockExecuteWorkflow).toHaveBeenCalledWith(
      'release/1.0',
      'release.yml',
      expect.any(Object),
    );
    expect(results.some((r) => r.success && r.steps?.some((s) => s.includes('release')))).toBe(true);
  });

  it('executes hotfix workflow when hotfix active and branch set', async () => {
    mockExecuteWorkflow.mockClear();
    const param = baseParam({
      release: { active: false },
      hotfix: { active: true, branch: 'hotfix/1.0.1', version: '1.0.1' },
      workflows: { release: 'release.yml', hotfix: 'hotfix.yml' },
      issue: { ...baseParam().issue, number: 42, body: '## Hotfix Solution\n- Fix' },
    });
    const results = await useCase.invoke(param);
    expect(mockExecuteWorkflow).toHaveBeenLastCalledWith(
      'hotfix/1.0.1',
      'hotfix.yml',
      expect.objectContaining({ version: '1.0.1', issue: 42 }),
    );
    expect(results.some((r) => r.steps?.some((s) => s.includes('hotfix')))).toBe(true);
  });

  it('returns failure when executeWorkflow throws', async () => {
    mockExecuteWorkflow.mockRejectedValue(new Error('Workflow error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results.some((r) => r.success === false)).toBe(true);
  });
});
