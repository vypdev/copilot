/**
 * Integration-style tests for CheckProgressUseCase with the OpenCode-based flow.
 * Covers edge cases: missing AI config, no issue/branch/description, AI returns undefined/invalid
 * progress, progress 0% (single call; HTTP retries are in the findings adapter), success path with label updates.
 */

import { CheckProgressUseCase } from '../check_progress_use_case';
import { ProgressDiffRepository } from '../../../../data/repository/progress_diff_repository';
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
const SOURCE_HEAD = 'a'.repeat(40);
const BASE_HEAD = 'c'.repeat(40);
const mockGetDiff = jest.fn();
const NEWER_HEAD = 'b'.repeat(40);


const mockAskAgent = jest.fn();
async function localizedProgress(request: { configuration: unknown; agentId: string; prompt: string; options?: { schemaName?: string } }): Promise<AgentQueryResult> {
  if (request.options?.schemaName === 'progress_scope') {
    return { outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] };
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

describe('CheckProgressUseCase', () => {
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
      { isIssueOpen: jest.fn(async () => true), getBranchHeadSha: mockGetBranchHeadSha },
      { getDiff: mockGetDiff }, { getSource: jest.fn(async () => ({ kind: 'none' as const })) }
    );
    invoke = (param) => useCase.invoke(projectProgressContext(param));
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

  it('returns error when AI config is missing (no server URL)', async () => {
    const param = baseParam({
      ai: new Ai('', 'opencode/model', false, [], false, 'low', 20),
    });
    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain(
      'Could not retrieve issue description for issue #123'
    );
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns error when AI config is missing (no model)', async () => {
    const param = baseParam({
      ai: new Ai('http://localhost:4096', '', false, [], false, 'low', 20),
    });
    const results = await invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain(
      'Missing required agent configuration. Provide a model and a valid executable.'
    );
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns error when issue number is -1', async () => {
    const param = baseParam({ issueNumber: -1 });
    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain(
      'Issue number not found. Cannot check progress without an issue number.'
    );
    expect(mockGetDescription).not.toHaveBeenCalled();
  });

  it('returns error when issue description could not be retrieved', async () => {
    mockGetDescription.mockResolvedValue(null);
    const param = baseParam();

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain(
      'Could not retrieve issue description for issue #123'
    );
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns error when no branch is found (no commit.branch and no matching branch in list)', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockGetListOfBranches.mockResolvedValue(['main', 'develop', 'other/456-foo']);
    const param = baseParam({ commit: { branch: undefined as unknown as string } });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('Could not find branch'))).toBe(true);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('finds branch from list when commit.branch is not set', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockGetListOfBranches.mockResolvedValue(['feature/123-add-feature', 'main', 'develop']);
    mockAskAgent.mockResolvedValue({
      progress: 60,
      summary: 'More than half done',
      remaining: 'Tests',
    });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);
    const param = baseParam({ commit: { branch: undefined as unknown as string } });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].payload).toMatchObject({ progress: 60, branch: 'feature/123-add-feature' });
    expect(mockAskAgent).toHaveBeenCalled();
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('123');
    expect(prompt).toContain('develop');
    expect(prompt).toContain('feature/123-add-feature');
    expect(prompt).toContain('Issue body');
    expect(prompt).toContain('PINNED_SOURCE_PATCH');
    expect(prompt).not.toContain('git diff');
    expect(mockGetDiff).toHaveBeenCalledWith(BASE_HEAD, SOURCE_HEAD);
  });

  it('returns error result when askAgent returns undefined (OpenCode failure)', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue(undefined);

    const results = await invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors[0]).toMatchObject({ code: 'locale.output-invalid' });
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
  });

  it('rejects a mismatched output locale before changing labels', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ outputLocale: 'fr-FR', progress: 80, summary: 'Terminé', remaining: null });

    const results = await invoke(baseParam());

    expect(results[0].errors[0]).toMatchObject({ code: 'locale.output-invalid' });
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
    expect(mockSetLabels).not.toHaveBeenCalled();
  });

  it('returns error when progress is 0% (single call; HTTP retries are in the findings adapter)', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 0, summary: 'No progress yet' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);

    const results = await invoke(baseParam());

    expect(results[0].success).toBe(false);
    expect(results[0].payload).toMatchObject({ progress: 0 });
    expect(results[0].errors?.some((e) => String(e).includes('Progress detection returned 0%'))).toBe(true);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
  });

  it('rejects negative progress without changing labels', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: -10, summary: 'Invalid' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);

    const results = await invoke(baseParam());

    expect(results[0].success).toBe(false);
    expect(results[0].errors[0]).toMatchObject({ code: 'agent.failed' });
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range completion estimate', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 150, summary: 'Over' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);

    const results = await invoke(baseParam());

    expect(results[0].success).toBe(false);
    expect(results[0].errors[0]).toMatchObject({ code: 'agent.failed' });
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
  });

  it('success path: sets progress label on issue and on open PRs', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({
      progress: 75,
      summary: 'Almost there',
      remaining: 'Final tests',
    });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([99]);
    mockGetLabels.mockResolvedValue(['feature', '50%']);

    const results = await invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].steps).toContain('Progress updated to: 75%');
    expect(mockSetProgressLabel).toHaveBeenCalledWith(123, 75);
    expect(mockGetLabels).toHaveBeenCalledWith(99);
    expect(mockSetLabels).toHaveBeenCalledWith(
      99,
      expect.arrayContaining(['feature', '75%']),
    );
  });

  it('carries the canonical source head and revalidates it before changing labels', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 75, summary: 'Current source' });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);

    const results = await invoke(baseParam({ inputs: { after: SOURCE_HEAD.toUpperCase() } }));

    expect(mockGetBranchHeadSha).toHaveBeenCalledWith('feature/123-add-feature');
    expect(mockSetProgressLabel).toHaveBeenCalledWith(123, 75);
    expect(results[0].payload).toMatchObject({ sourceHeadSha: SOURCE_HEAD });
  });

  it('suppresses an event that is already stale before agent work starts', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 75, summary: 'Outdated source' });
    mockGetBranchHeadSha.mockResolvedValue(NEWER_HEAD);

    const results = await invoke(baseParam({ inputs: { after: SOURCE_HEAD } }));

    expect(results[0]).toMatchObject({
      success: true,
      executed: false,
      payload: { publicationOutcome: { reason: 'stale-source', branch: 'feature/123-add-feature', sourceHeadSha: SOURCE_HEAD } },
    });
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
    expect(mockGetLabels).not.toHaveBeenCalled();
    expect(mockSetLabels).not.toHaveBeenCalled();
  });

  it('suppresses native and conversational state when the branch advances during analysis', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 75, summary: 'Outdated source' });
    mockGetBranchHeadSha.mockResolvedValueOnce(SOURCE_HEAD).mockResolvedValueOnce(BASE_HEAD).mockResolvedValueOnce(NEWER_HEAD);

    const results = await invoke(baseParam());

    expect(results[0]).toMatchObject({
      success: true,
      executed: false,
      payload: { publicationOutcome: { reason: 'stale-source', branch: 'feature/123-add-feature', sourceHeadSha: SOURCE_HEAD } },
    });
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
    expect(mockSetLabels).not.toHaveBeenCalled();
  });

  it.each(['wrong base', 'wrong head', 'unavailable comparison'])('retains progress without an agent call for %s', async scenario => {
    mockGetDescription.mockResolvedValue('Issue body');
    if (scenario === 'unavailable comparison') mockGetDiff.mockRejectedValue(new Error('private transport'));
    else mockGetDiff.mockResolvedValue({ baseSha: scenario === 'wrong base' ? NEWER_HEAD : BASE_HEAD,
      headSha: scenario === 'wrong head' ? NEWER_HEAD : SOURCE_HEAD, evidence: 'wrong scope' });
    const results = await invoke(baseParam());
    expect(results[0].success).toBe(false); expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockSetProgressLabel).not.toHaveBeenCalled(); expect(mockSetLabels).not.toHaveBeenCalled();
    expect(JSON.stringify(results[0])).not.toContain('private transport');
  });
  it('retains progress and makes no model call when the authenticated provider omits a lockfile patch', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    const compareCommits = jest.fn(async () => ({ data: { base_commit: { sha: BASE_HEAD }, merge_base_commit: { sha: BASE_HEAD }, files: [{ filename: 'frontend/pnpm-lock.yaml', status: 'modified', additions: 973, deletions: 1410 }] } }));
    const repository = new ProgressDiffRepository({ getClient: () => ({ rest: { repos: { compareCommits } } }) } as never);
    mockGetDiff.mockImplementation((base, head) => repository.getDiff('owner', 'repo', base, head, 'token'));
    const results = await invoke(baseParam());
    expect(results[0]).toMatchObject({ success: false, errors: [{ code: 'validation.evidence-unavailable', retryable: false }] });
    expect(compareCommits).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', base: BASE_HEAD, head: SOURCE_HEAD, per_page: 1, page: 1 });
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
    expect(mockSetLabels).not.toHaveBeenCalled();
  });

  it('withholds progress mutation when the base branch changes during analysis', async () => {
    mockGetDescription.mockResolvedValue('Issue body'); mockAskAgent.mockResolvedValue({ progress: 75, summary: 'Old base' });
    mockGetBranchHeadSha.mockResolvedValueOnce(SOURCE_HEAD).mockResolvedValueOnce(BASE_HEAD).mockResolvedValueOnce(SOURCE_HEAD).mockResolvedValueOnce(NEWER_HEAD);
    const results = await invoke(baseParam());
    expect(results[0]).toMatchObject({ success: true, executed: false, payload: { publicationOutcome: { reason: 'stale-source' } } });
    expect(mockAskAgent).toHaveBeenCalledTimes(1); expect(mockSetProgressLabel).not.toHaveBeenCalled();
  });

  it('maps authoritative source lookup failures without mutating labels', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 75, summary: 'Current source' });
    mockGetBranchHeadSha.mockRejectedValue(new Error('secret provider detail'));

    const results = await invoke(baseParam({ inputs: { after: SOURCE_HEAD } }));

    expect(results[0].errors[0]).toMatchObject({ code: 'workflow.failed' });
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
  });

  it('retains progress when a required assessment summary is missing', async () => {
    mockGetDescription.mockResolvedValue('Issue body');
    mockAskAgent.mockResolvedValue({ progress: 30 });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);

    const results = await invoke(baseParam());

    expect(results[0].success).toBe(false);
    expect(results[0].errors[0]).toMatchObject({ code: 'agent.failed' });
    expect(mockSetProgressLabel).not.toHaveBeenCalled();
  });
});
