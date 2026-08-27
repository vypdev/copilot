/**
 * Tests for DeployedActionUseCase: deploy label flow and post-deploy merges.
 *
 * The "deployed" single action runs after a successful deployment. It requires the issue to have
 * the "deploy" label (and not already "deployed"). It then: sets the "deployed" label, merges
 * release/hotfix branches into default and develop, and closes the issue when all merges succeed.
 *
 * See docs/single-actions/deploy-label-and-merge.mdx for the full flow and merge/check behaviour.
 */

import { DeployedActionUseCase } from '../deployed_action_use_case';
import { Result } from '../../../../data/model/result';
import type { Execution } from '../../../../data/model/execution';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockSetLabels = jest.fn();
const mockCloseIssue = jest.fn();

const mockMergeBranch = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    tokens: { token: 'token' },
    labels: {
      isDeploy: true,
      isDeployed: false,
      deploy: 'deploy',
      deployed: 'deployed',
      currentIssueLabels: ['deploy', 'feature'],
    },
    singleAction: { issue: 42 },
    currentConfiguration: {
      releaseBranch: undefined as string | undefined,
      hotfixBranch: undefined as string | undefined,
    },
    branches: {
      defaultBranch: 'main',
      development: 'develop',
    },
    pullRequest: { mergeTimeout: 60 },
    ...overrides,
  } as unknown as Execution;
}

function successResult(step: string): Result[] {
  return [
    new Result({
      id: 'branch_repository',
      success: true,
      executed: true,
      steps: [step],
    }),
  ];
}

function failureResult(step: string): Result[] {
  return [
    new Result({
      id: 'branch_repository',
      success: false,
      executed: true,
      steps: [step],
    }),
  ];
}

describe('DeployedActionUseCase', () => {
  let useCase: DeployedActionUseCase;

  beforeEach(() => {
    useCase = new DeployedActionUseCase(
      { setLabels: mockSetLabels, getLabels: jest.fn() },
      { closeIssue: mockCloseIssue, addComment: jest.fn() },
      { mergeBranch: mockMergeBranch },
    );
    mockSetLabels.mockResolvedValue(undefined);
    mockCloseIssue.mockResolvedValue(true);
    mockSetLabels.mockClear();
    mockCloseIssue.mockClear();
    mockMergeBranch.mockClear();
  });

  describe('deploy label validation', () => {
    it('returns failure when there is no deploy label', async () => {
    const param = baseParam({
      labels: {
        isDeploy: false,
        isDeployed: false,
        deploy: 'deploy',
        deployed: 'deployed',
        currentIssueLabels: ['feature'],
      },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps[0]).toContain('no `deploy` label');
    expect(mockSetLabels).not.toHaveBeenCalled();
    expect(mockMergeBranch).not.toHaveBeenCalled();
    expect(mockCloseIssue).not.toHaveBeenCalled();
  });

    it('returns failure when deployed label is already set', async () => {
    const param = baseParam({
      labels: {
        isDeploy: true,
        isDeployed: true,
        deploy: 'deploy',
        deployed: 'deployed',
        currentIssueLabels: ['deploy', 'deployed'],
      },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps[0]).toContain('already set');
    expect(mockSetLabels).not.toHaveBeenCalled();
    expect(mockMergeBranch).not.toHaveBeenCalled();
    expect(mockCloseIssue).not.toHaveBeenCalled();
  });
  });

  describe('label update and merge (no release/hotfix branch)', () => {
    it('updates labels but does not close issue when no release or hotfix branch (no merges)', async () => {
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockSetLabels).toHaveBeenCalledWith(
      'owner',
      'repo',
      42,
      expect.arrayContaining(['feature', 'deployed']),
      'token'
    );
    expect(mockMergeBranch).not.toHaveBeenCalled();
    expect(mockCloseIssue).not.toHaveBeenCalled();
    expect(results.some((r) => r.steps?.some((s) => s.includes('Label') && s.includes('deployed')))).toBe(true);
    expect(results.some((r) => r.steps?.some((s) => s.includes('not closed because no release or hotfix branch was configured')))).toBe(true);
  });
  });

  describe('release branch: merge to default then develop, close issue when all succeed', () => {
    it('merges release into default then into develop and closes issue when all merges succeed', async () => {
    mockMergeBranch
      .mockResolvedValueOnce(successResult('Merged release into main'))
      .mockResolvedValueOnce(successResult('Merged release into develop'));
    const param = baseParam({
      currentConfiguration: {
        releaseBranch: 'release/1.0.0',
        hotfixBranch: undefined,
      },
    });

    const results = await useCase.invoke(param);

    expect(mockMergeBranch).toHaveBeenCalledTimes(2);
    expect(mockMergeBranch).toHaveBeenNthCalledWith(
      1,
      'owner',
      'repo',
      'release/1.0.0',
      'main',
      60,
      'token'
    );
    expect(mockMergeBranch).toHaveBeenNthCalledWith(
      2,
      'owner',
      'repo',
      'release/1.0.0',
      'develop',
      60,
      'token'
    );
    expect(mockCloseIssue).toHaveBeenCalledWith('owner', 'repo', 42, 'token');
    expect(results.some((r) => r.steps?.some((s) => s.includes('closed after merge')))).toBe(true);
  });

    it('does not close issue when first merge (to default) fails', async () => {
    mockMergeBranch
      .mockResolvedValueOnce(failureResult('Failed to merge into main'))
      .mockResolvedValueOnce(successResult('Merged into develop'));
    const param = baseParam({
      currentConfiguration: {
        releaseBranch: 'release/1.0.0',
        hotfixBranch: undefined,
      },
    });

    const results = await useCase.invoke(param);

    expect(mockMergeBranch).toHaveBeenCalledTimes(2);
    expect(mockCloseIssue).not.toHaveBeenCalled();
    expect(results.some((r) => r.success === false && r.steps?.some((s) => s.includes('not closed because one or more merge operations failed')))).toBe(true);
  });

    it('does not close issue when second merge (to develop) fails', async () => {
    mockMergeBranch
      .mockResolvedValueOnce(successResult('Merged into main'))
      .mockResolvedValueOnce(failureResult('Failed to merge into develop'));
    const param = baseParam({
      currentConfiguration: {
        releaseBranch: 'release/1.0.0',
        hotfixBranch: undefined,
      },
    });

    const results = await useCase.invoke(param);

    expect(mockCloseIssue).not.toHaveBeenCalled();
    expect(results.some((r) => r.steps?.some((s) => s.includes('not closed because one or more merge operations failed')))).toBe(true);
  });

    it('pushes merge results into returned array', async () => {
    mockMergeBranch
      .mockResolvedValueOnce(successResult('Step A'))
      .mockResolvedValueOnce(successResult('Step B'));
    const param = baseParam({
      currentConfiguration: {
        releaseBranch: 'release/1.0.0',
        hotfixBranch: undefined,
      },
    });

    const results = await useCase.invoke(param);

    const mergeSteps = results.flatMap((r) => r.steps).filter((s) => s === 'Step A' || s === 'Step B');
    expect(mergeSteps).toContain('Step A');
    expect(mergeSteps).toContain('Step B');
  });

    it('when all merges succeed but closeIssue returns false, does not push close step', async () => {
      mockMergeBranch
        .mockResolvedValueOnce(successResult('Merged into main'))
        .mockResolvedValueOnce(successResult('Merged into develop'));
      mockCloseIssue.mockResolvedValue(false);
      const param = baseParam({
        currentConfiguration: {
          releaseBranch: 'release/1.0.0',
          hotfixBranch: undefined,
        },
      });

      const results = await useCase.invoke(param);

      expect(mockCloseIssue).toHaveBeenCalledWith('owner', 'repo', 42, 'token');
      expect(results.some((r) => r.steps?.some((s) => s.includes('closed after merge')))).toBe(false);
    });
  });

  describe('hotfix branch: merge hotfix to default, then default to develop', () => {
    it('merges hotfix into default then default into develop and closes issue when all succeed', async () => {
    mockMergeBranch
      .mockResolvedValueOnce(successResult('Merged hotfix into main'))
      .mockResolvedValueOnce(successResult('Merged main into develop'));
    const param = baseParam({
      currentConfiguration: {
        releaseBranch: undefined,
        hotfixBranch: 'hotfix/1.0.1',
      },
    });

    const results = await useCase.invoke(param);

    expect(mockMergeBranch).toHaveBeenCalledTimes(2);
    expect(mockMergeBranch).toHaveBeenNthCalledWith(1, 'owner', 'repo', 'hotfix/1.0.1', 'main', 60, 'token');
    expect(mockMergeBranch).toHaveBeenNthCalledWith(2, 'owner', 'repo', 'main', 'develop', 60, 'token');
    expect(mockCloseIssue).toHaveBeenCalledWith('owner', 'repo', 42, 'token');
    expect(results.some((r) => r.steps?.some((s) => s.includes('closed after merge')))).toBe(true);
  });

    it('does not close issue when one merge fails', async () => {
    mockMergeBranch
      .mockResolvedValueOnce(successResult('Merged hotfix into main'))
      .mockResolvedValueOnce(failureResult('Failed to merge main into develop'));
    const param = baseParam({
      currentConfiguration: {
        releaseBranch: undefined,
        hotfixBranch: 'hotfix/1.0.1',
      },
    });

    const results = await useCase.invoke(param);

    expect(mockCloseIssue).not.toHaveBeenCalled();
    expect(results.some((r) => r.steps?.some((s) => s.includes('not closed because one or more merge operations failed')))).toBe(true);
  });
  });

  describe('errors', () => {
    it('when setLabels throws, returns error result and does not call merge or close', async () => {
      mockSetLabels.mockRejectedValueOnce(new Error('API error'));
      const param = baseParam();

      const results = await useCase.invoke(param);

      expect(results.some((r) => r.success === false)).toBe(true);
      expect(results.some((r) => r.steps?.some((s) => s.includes('assign members to issue')))).toBe(true);
      expect(mockMergeBranch).not.toHaveBeenCalled();
      expect(mockCloseIssue).not.toHaveBeenCalled();
    });
  });
});
