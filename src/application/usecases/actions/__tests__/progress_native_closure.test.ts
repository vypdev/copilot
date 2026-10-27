/**
 * Integration-style tests for CheckProgressUseCase with the OpenCode-based flow.
 * Covers edge cases: missing AI config, no issue/branch/description, AI returns undefined/invalid
 * progress, progress 0% (single call; HTTP retries are in the findings adapter), success path with label updates.
 */

import { CheckProgressUseCase } from '../check_progress_use_case';
import { Ai } from '../../../../data/model/ai';
import type { Execution } from '../../../../data/model/execution';
import { projectProgressContext } from '../../push_single_action_contexts';
import type { AgentQueryResult } from '../../../ports/agent_query_ports';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const mockGetDescription = jest.fn();
const mockSetProgressLabel = jest.fn();
const mockGetLabels = jest.fn();
const mockSetLabels = jest.fn();

const mockGetListOfBranches = jest.fn();

const mockGetOpenPullRequestNumbersByHeadBranch = jest.fn();
const mockGetBranchHeadSha = jest.fn();
const mockIsIssueOpen = jest.fn();
const SOURCE_HEAD = 'a'.repeat(40);
const BASE_HEAD = 'c'.repeat(40);
const mockGetDiff = jest.fn();
const NEWER_HEAD = 'b'.repeat(40);


const mockAskAgent = jest.fn();
async function localizedProgress(request: { configuration: unknown; agentId: string; prompt: string; options?: { schemaName?: string } }): Promise<AgentQueryResult> {
  if (request.options?.schemaName === 'progress_scope') {
    const issue = await mockGetDescription.mock.results[mockGetDescription.mock.results.length - 1].value;
    return { outputLocale: 'en-US', requirements: [issue.trim()], exclusions: [] };
  }
  const response = await mockAskAgent(request.configuration, request.agentId, request.prompt, request.options);
  return response && typeof response === 'object' && !Array.isArray(response)
    ? (() => {
      const value = response as Record<string, unknown>;
      return { outputLocale: value.outputLocale ?? 'en-US', progress: value.progress,
        requirements: [{ id: 'R1', status: value.progress === 100 ? 'supported' : 'verification-unknown',
          evidence: value.progress === 100 ? 'source-only' : 'external-unverified', summary: value.summary,
          remaining: value.progress === 100 ? null : value.remaining ?? 'Verification unknown.' }] };
    })()
    : response;
}
function baseParam(overrides: Record<string, unknown> = {}): Execution {
  const branches = {
    main: 'main',
    development: 'develop',
    featureTree: 'feature',
    bugfixTree: 'bugfix',
    hotfixTree: 'hotfix',
    releaseTree: 'release',
    docsTree: 'docs',
    choreTree: 'chore',
  };
  return {
    owner: 'owner',
    repo: 'repo',
    issueNumber: 123,
    tokens: { token: 'token' },
    locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
    ai: new Ai('http://localhost:4096', 'opencode/kimi-k2.5', false, [], false, 'low', 20),
    commit: { branch: 'feature/123-add-feature' },
    branches,
    ...overrides,
  } as unknown as Execution;
}

describe('native progress closure races', () => {
  let useCase: CheckProgressUseCase;
  let invoke: (param: Execution) => ReturnType<CheckProgressUseCase['invoke']>;

  beforeEach(() => {
    useCase = new CheckProgressUseCase(
      { getDescription: mockGetDescription },
      { getLabels: mockGetLabels, setLabels: mockSetLabels },
      { setProgressLabel: mockSetProgressLabel },
      { getListOfBranches: mockGetListOfBranches },
      { getOpenPullRequestNumbersByHeadBranch: mockGetOpenPullRequestNumbersByHeadBranch },
      { query: localizedProgress },
      { isIssueOpen: mockIsIssueOpen, getBranchHeadSha: mockGetBranchHeadSha },
      { getDiff: mockGetDiff },
    );
    invoke = (param) => useCase.invoke(projectProgressContext(param));
    mockIsIssueOpen.mockReset().mockResolvedValue(true);
    mockGetDescription.mockReset();
    mockSetProgressLabel.mockReset();
    mockGetLabels.mockReset();
    mockSetLabels.mockReset();
    mockGetListOfBranches.mockReset();
    mockGetOpenPullRequestNumbersByHeadBranch.mockReset();
    mockGetBranchHeadSha.mockReset();
    mockGetBranchHeadSha.mockImplementation(async branch => branch === 'develop' ? BASE_HEAD : SOURCE_HEAD);
    mockGetDiff.mockReset();
    mockGetDiff.mockImplementation(async (baseSha, headSha) => ({ baseSha, headSha, evidence: 'PINNED_SOURCE_PATCH' }));
    mockAskAgent.mockReset();
  });

  it.each(['closed', 'denied'])('omits analysis and label effects for %s native state', async kind => {
    if (kind === 'closed') mockIsIssueOpen.mockResolvedValue(false);
    else mockIsIssueOpen.mockRejectedValue(new Error('private native issue error'));
    const results = await invoke(baseParam());
    expect(results[0].success).toBe(false); expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockGetDescription).not.toHaveBeenCalled(); expect(mockSetProgressLabel).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain('private native issue error');
  });
  it('retains labels when the issue closes during analysis at an unchanged Git head', async () => {
    mockGetDescription.mockResolvedValue('Issue description');
    mockAskAgent.mockImplementation(async () => { mockIsIssueOpen.mockResolvedValue(false); return { progress: 96, summary: 'Estimate', reasoning: 'Reason', remaining: 'Verify' }; });
    const results = await invoke(baseParam());
    expect(mockAskAgent).toHaveBeenCalledTimes(1); expect(mockSetProgressLabel).not.toHaveBeenCalled();
    expect(mockSetLabels).not.toHaveBeenCalled(); expect(results[0].payload).not.toHaveProperty('progress');
  });
  it('fails closed before analysis when the native query is absent', async () => {
    const source = { getBranchHeadSha: mockGetBranchHeadSha };
    const denied = new CheckProgressUseCase({ getDescription: mockGetDescription }, { getLabels: mockGetLabels, setLabels: mockSetLabels },
      { setProgressLabel: mockSetProgressLabel }, { getListOfBranches: mockGetListOfBranches },
      { getOpenPullRequestNumbersByHeadBranch: mockGetOpenPullRequestNumbersByHeadBranch }, { query: localizedProgress }, source, { getDiff: mockGetDiff });
    const results = await denied.invoke(projectProgressContext(baseParam()));
    expect(results[0].errors[0]).toMatchObject({ code: 'configuration.unsupported' });
    expect(mockAskAgent).not.toHaveBeenCalled(); expect(mockGetDescription).not.toHaveBeenCalled();
  });
});
