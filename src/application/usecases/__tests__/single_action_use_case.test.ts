import { SingleActionUseCase } from '../single_action_use_case';
import type { Execution } from '../../../data/model/execution';
import { Ai } from '../../../data/model/ai';
import { Result } from '../../../data/model/result';
import { ACTIONS } from '../../../data/model/action_types';

jest.mock('../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

const mockPublishInvoke = jest.fn();
const mockCreateReleaseInvoke = jest.fn();
const mockCreateTagInvoke = jest.fn();
const mockThinkInvoke = jest.fn();
const mockInitialSetupInvoke = jest.fn();
const mockCheckProgressInvoke = jest.fn();
const mockDetectProblemsInvoke = jest.fn();
const mockRecommendStepsInvoke = jest.fn();

jest.mock('../actions/publish_github_action_use_case', () => ({
  PublishGithubActionUseCase: jest.fn().mockImplementation(() => ({ invoke: mockPublishInvoke })),
}));
jest.mock('../actions/create_release_use_case', () => ({
  CreateReleaseUseCase: jest.fn().mockImplementation(() => ({ invoke: mockCreateReleaseInvoke })),
}));
jest.mock('../actions/create_tag_use_case', () => ({
  CreateTagUseCase: jest.fn().mockImplementation(() => ({ invoke: mockCreateTagInvoke })),
}));
jest.mock('../steps/common/think_use_case', () => ({
  ThinkUseCase: jest.fn().mockImplementation(() => ({ invoke: mockThinkInvoke })),
}));
jest.mock('../actions/initial_setup_use_case', () => ({
  InitialSetupUseCase: jest.fn().mockImplementation(() => ({ invoke: mockInitialSetupInvoke })),
}));
jest.mock('../actions/check_progress_use_case', () => ({
  CheckProgressUseCase: jest.fn().mockImplementation(() => ({ invoke: mockCheckProgressInvoke })),
}));
jest.mock('../steps/commit/detect_potential_problems_use_case', () => ({
  DetectPotentialProblemsUseCase: jest.fn().mockImplementation(() => ({
    invoke: mockDetectProblemsInvoke,
  })),
}));
jest.mock('../actions/recommend_steps_use_case', () => ({
  RecommendStepsUseCase: jest.fn().mockImplementation(() => ({ invoke: mockRecommendStepsInvoke })),
}));

function minimalExecution(singleAction: {
  validSingleAction: boolean;
  currentSingleAction: string;
  isPublishGithubAction?: boolean;
  isCreateReleaseAction?: boolean;
  isCreateTagAction?: boolean;
  isThinkAction?: boolean;
  isInitialSetupAction?: boolean;
  isCheckProgressAction?: boolean;
  isDetectPotentialProblemsAction?: boolean;
  isRecommendStepsAction?: boolean;
  isCloseInactiveIssuesAction?: boolean;
  isPublishIssueCommentAction?: boolean;
  isCheckBranchSyncAction?: boolean;
}): Execution {
  return {
    ai: new Ai('', 'model', false, [], false, 'low', 20),
    singleAction: {
      validSingleAction: singleAction.validSingleAction,
      currentSingleAction: singleAction.currentSingleAction,
      get isPublishGithubAction() {
        return singleAction.isPublishGithubAction ?? this.currentSingleAction === ACTIONS.PUBLISH_GITHUB_ACTION;
      },
      get isCreateReleaseAction() {
        return singleAction.isCreateReleaseAction ?? this.currentSingleAction === ACTIONS.CREATE_RELEASE;
      },
      get isCreateTagAction() {
        return singleAction.isCreateTagAction ?? this.currentSingleAction === ACTIONS.CREATE_TAG;
      },
      get isThinkAction() {
        return singleAction.isThinkAction ?? this.currentSingleAction === ACTIONS.THINK;
      },
      get isInitialSetupAction() {
        return singleAction.isInitialSetupAction ?? this.currentSingleAction === ACTIONS.INITIAL_SETUP;
      },
      get isCheckProgressAction() {
        return singleAction.isCheckProgressAction ?? this.currentSingleAction === ACTIONS.CHECK_PROGRESS;
      },
      get isDetectPotentialProblemsAction() {
        return singleAction.isDetectPotentialProblemsAction ?? this.currentSingleAction === ACTIONS.DETECT_POTENTIAL_PROBLEMS;
      },
      get isRecommendStepsAction() {
        return singleAction.isRecommendStepsAction ?? this.currentSingleAction === ACTIONS.RECOMMEND_STEPS;
      },
      get isCloseInactiveIssuesAction() {
        return singleAction.isCloseInactiveIssuesAction ?? this.currentSingleAction === ACTIONS.CLOSE_INACTIVE_ISSUES;
      },
      get isPublishIssueCommentAction() {
        return singleAction.isPublishIssueCommentAction ?? this.currentSingleAction === ACTIONS.PUBLISH_ISSUE_COMMENT;
      },
      get isCheckBranchSyncAction() {
        return singleAction.isCheckBranchSyncAction ?? this.currentSingleAction === ACTIONS.CHECK_BRANCH_SYNC;
      },
    } as Execution['singleAction'],
  } as Execution;
}

describe('SingleActionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockThinkInvoke.mockResolvedValue([]);
    mockCheckProgressInvoke.mockResolvedValue([]);
    mockRecommendStepsInvoke.mockResolvedValue([]);
  });

  it('returns empty results when not a valid single action', async () => {
    const useCase = new SingleActionUseCase({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const param = minimalExecution({
      validSingleAction: false,
      currentSingleAction: 'unknown',
    });

    const results = await useCase.invoke(param);

    expect(results).toEqual([]);
    expect(mockThinkInvoke).not.toHaveBeenCalled();
  });

  it('dispatches to ThinkUseCase when action is think', async () => {
    const r = new Result({ id: 'think', success: true, executed: true, steps: [] });
    mockThinkInvoke.mockResolvedValue([r]);

    const useCase = new SingleActionUseCase({} as any, {} as any, {} as any, { invoke: mockThinkInvoke } as any, {} as any, {} as any, {} as any, {} as any);
    const param = minimalExecution({
      validSingleAction: true,
      currentSingleAction: ACTIONS.THINK,
    });

    const results = await useCase.invoke(param);

    expect(mockThinkInvoke).toHaveBeenCalledWith(param);
    expect(results).toEqual([r]);
  });

  it('dispatches to CloseInactiveIssuesUseCase when action is close_inactive_issues_action', async () => {
    const closeInactiveInvoke = jest.fn().mockResolvedValue([]);
    const useCase = new SingleActionUseCase(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { invoke: closeInactiveInvoke } as any,
    );
    const param = minimalExecution({
      validSingleAction: true,
      currentSingleAction: ACTIONS.CLOSE_INACTIVE_ISSUES,
    });

    await useCase.invoke(param);

    expect(closeInactiveInvoke).toHaveBeenCalledWith(param);
  });

  it('dispatches to PublishIssueCommentUseCase when action is publish_issue_comment', async () => {
    const publishIssueCommentInvoke = jest.fn().mockResolvedValue([]);
    const useCase = new SingleActionUseCase(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      { invoke: publishIssueCommentInvoke } as any,
    );
    const param = minimalExecution({
      validSingleAction: true,
      currentSingleAction: ACTIONS.PUBLISH_ISSUE_COMMENT,
    });

    await useCase.invoke(param);

    expect(publishIssueCommentInvoke).toHaveBeenCalledWith(param);
  });

  it('dispatches to CheckProgressUseCase when action is check_progress', async () => {
    mockCheckProgressInvoke.mockResolvedValue([
      new Result({ id: 'cp', success: true, executed: true, steps: [] }),
    ]);

    const useCase = new SingleActionUseCase({} as any, {} as any, {} as any, {} as any, {} as any, { invoke: mockCheckProgressInvoke } as any, {} as any, {} as any);
    const param = minimalExecution({
      validSingleAction: true,
      currentSingleAction: ACTIONS.CHECK_PROGRESS,
    });

    const results = await useCase.invoke(param);

    expect(mockCheckProgressInvoke).toHaveBeenCalledWith(param);
    expect(results).toHaveLength(1);
  });

  it('dispatches the lightweight branch-sync observer without authorization or an agent', async () => {
    const observe = { invoke: jest.fn().mockResolvedValue([]) };
    const useCase = new SingleActionUseCase(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      undefined,
      undefined,
      undefined,
      observe as any,
    );
    const param = minimalExecution({ validSingleAction: true, currentSingleAction: ACTIONS.CHECK_BRANCH_SYNC });

    await useCase.invoke(param);

    expect(observe.invoke).toHaveBeenCalledWith(param);
  });

  it('dispatches to RecommendStepsUseCase when action is recommend_steps', async () => {
    mockRecommendStepsInvoke.mockResolvedValue([
      new Result({ id: 'rec', success: true, executed: true, steps: [] }),
    ]);

    const useCase = new SingleActionUseCase({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { invoke: mockRecommendStepsInvoke } as any);
    const param = minimalExecution({
      validSingleAction: true,
      currentSingleAction: ACTIONS.RECOMMEND_STEPS,
    });

    const results = await useCase.invoke(param);

    expect(mockRecommendStepsInvoke).toHaveBeenCalledWith(param);
    expect(results).toHaveLength(1);
  });

  it('on error pushes failure result with action name', async () => {
    mockThinkInvoke.mockRejectedValue(new Error('think failed'));

    const useCase = new SingleActionUseCase({} as any, {} as any, {} as any, { invoke: mockThinkInvoke } as any, {} as any, {} as any, {} as any, {} as any);
    const param = minimalExecution({
      validSingleAction: true,
      currentSingleAction: ACTIONS.THINK,
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps?.[0]).toContain(ACTIONS.THINK);
  });

  it('skips an agent-backed single action for an unauthorized members-only actor', async () => {
    const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false) };
    const useCase = new SingleActionUseCase(
      {} as any,
      {} as any,
      {} as any,
      { invoke: mockThinkInvoke } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      authorization,
    );
    const param = minimalExecution({
      validSingleAction: true,
      currentSingleAction: ACTIONS.THINK,
    });
    Object.assign(param, {
      owner: 'org',
      repo: 'repo',
      actor: 'external-user',
      tokens: { token: 'token' },
      ai: new Ai('', 'model', true, [], false, 'low', 20),
    });

    const results = await useCase.invoke(param);

    expect(results).toEqual([]);
    expect(mockThinkInvoke).not.toHaveBeenCalled();
  });
});
