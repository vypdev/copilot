import { Result } from "../../../data/model/result";
import type { Execution } from "../../../data/model/execution";
import { Ai } from "../../../data/model/ai";
import { runCommentAutomation as runCommentAutomationImpl } from "../comment_automation_use_case";
import type { CommentAutomationOptions } from '../comment_automation_contracts';
import type { ActorAuthorizationPort } from '../../ports/actor_authorization_ports';
import { projectCommentAutomationContext } from '../comment_automation_context';
import { projectCommentLanguageRequest } from '../steps/common/comment_language_translation_workflow';

type TestCommentAutomationOptions = Omit<
  CommentAutomationOptions,
  'bugbotGitMutationPort' | 'updatePullRequestDescriptionUseCase'
> & {
  userComment: string;
  bugbotGitMutationPort?: CommentAutomationOptions['bugbotGitMutationPort'];
  updatePullRequestDescriptionUseCase?: { invoke(): Promise<Result[]> };
};

jest.mock("../../../utils/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

jest.mock("../steps/commit/bugbot/commit_autofix_and_resolve_workflow", () => ({
  commitAutofixAndResolveFindings: jest.fn(),
}));

const {
  commitAutofixAndResolveFindings,
} = require("../steps/commit/bugbot/commit_autofix_and_resolve_workflow");

function successfulResult(id: string, payload?: unknown): Result {
  return new Result({
    id,
    success: true,
    executed: true,
    payload,
  });
}

function configuredAi(options: { membersOnly?: boolean; fixVerifyCommands?: string[] } = {}): Ai {
  return new Ai(
    "",
    "model",
    options.membersOnly ?? false,
    [],
    false,
    "low",
    20,
    options.fixVerifyCommands ?? [],
  );
}

function runCommentAutomation(
  execution: Execution,
  options: TestCommentAutomationOptions,
  actorAuthorizationPort: ActorAuthorizationPort,
  authenticatedUserPort?: {
    getTokenUserDetails?(): Promise<{ name: string; email: string }>;
  },
) {
  const source = {
    ...execution,
    owner: execution.owner ?? 'o',
    repo: execution.repo ?? 'r',
    issueNumber: execution.issueNumber ?? -1,
    isPullRequest: execution.isPullRequest ?? false,
    eventName: execution.eventName ?? 'issue_comment',
    commit: { ...(execution.commit ?? {}), branch: execution.commit?.branch ?? '' },
    currentConfiguration: execution.currentConfiguration ?? {},
    branches: execution.branches ?? {},
    issue: execution.issue ?? {},
    pullRequest: {
      ...(execution.pullRequest ?? {}),
      number: execution.pullRequest?.number ?? -1,
      head: execution.pullRequest?.head ?? '',
      action: execution.pullRequest?.action ?? '',
    },
    ai: execution.ai ?? configuredAi(),
  } as Execution;
  const bugbotGitMutationPort = Object.assign(
    {},
    options.bugbotGitMutationPort,
    {
      getAuthenticatedUserDetails: async () => {
        const details = await authenticatedUserPort?.getTokenUserDetails?.();
        return details ?? { name: 'Bot', email: 'bot@example.com' };
      },
    },
  ) as never;
  const {
    userComment,
    bugbotGitMutationPort: _bugbotGitMutationPort,
    updatePullRequestDescriptionUseCase,
    ...automationOptions
  } = options;
  const context = projectCommentAutomationContext(
    source as never,
    projectCommentLanguageRequest({
      commentBody: userComment,
      locale: 'en-US',
      issueNumber: source.issue.number ?? source.pullRequest.number,
      commentId: source.issue.commentId ?? source.pullRequest.commentId ?? -1,
      configuration: source.ai.getAgentConfiguration('findings'),
    }),
    userComment,
  );
  return runCommentAutomationImpl(context, {
    ...automationOptions,
    bugbotGitMutationPort,
    updatePullRequestDescriptionUseCase,
  }, {
    isActorAllowedToModifyFiles: (actor) => actorAuthorizationPort.isActorAllowedToModifyFiles(
      source.owner,
      source.repo,
      actor,
      source.tokens.token,
    ),
  });
}

describe("runCommentAutomation", () => {
  beforeEach(() => {
    commitAutofixAndResolveFindings.mockReset();
  });

  it("adds a failure result when post-autofix finding resolution fails", async () => {
    const resolutionError = new Error(
      "Unable to mark a pull request finding as resolved.",
    );
    commitAutofixAndResolveFindings.mockResolvedValue([resolutionError]);
    const intentResult = successfulResult("intent", {
      isFixRequest: true,
      isDoRequest: false,
      targetFindingIds: ["finding-1"],
      context: {},
    });
    const autofixResult = successfulResult("autofix", {});

    const results = await runCommentAutomation(
      {
        owner: "o",
        repo: "r",
        actor: "actor",
        tokenUser: "vypbot",
        tokens: { token: "t" },
      } as unknown as Execution,
      {
        taskId: "CommentAutomation",
        languageUseCase: {
          taskId: "language",
          invoke: jest.fn().mockResolvedValue([]),
        },
        intentUseCase: {
          taskId: "intent",
          invoke: jest.fn().mockResolvedValue([intentResult]),
        },
        thinkUseCase: {
          taskId: "think",
          invoke: jest.fn().mockResolvedValue([]),
        },
        autofixUseCase: {
          taskId: "autofix",
          invoke: jest.fn().mockResolvedValue([autofixResult]),
        },
        doUserRequestUseCase: {
          taskId: "do-user-request",
          invoke: jest.fn().mockResolvedValue([]),
        },
        userComment: "@vypbot fix it",
        bugbotGitMutationPort: {} as never,
      },
      {
        isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true),
      },
      {} as never,
    );

    expect(results).toContain(intentResult);
    expect(results).toContain(autofixResult);
    expect(results.at(-1)).toMatchObject({
      success: false,
      executed: true,
      errors: [expect.objectContaining({
        name: 'ApplicationError',
        code: 'workflow.failed',
        message: 'Autofix postflight could not complete.',
      })],
    });
    expect(JSON.stringify(results.at(-1))).not.toContain(resolutionError.message);
  });

  it("returns a sanitized failure result when intent detection rejects", async () => {
    const languageResult = successfulResult("language");
    const authorization = {
      isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true),
    };

    const results = await runCommentAutomation(
      {
        owner: "o",
        repo: "r",
        actor: "actor",
        tokenUser: "vypbot",
        tokens: { token: "t" },
      } as Execution,
      {
        taskId: "CommentAutomation",
        languageUseCase: {
          taskId: "language",
          invoke: jest.fn().mockResolvedValue([languageResult]),
        },
        intentUseCase: {
          taskId: "intent",
          invoke: jest
            .fn()
            .mockRejectedValue(new Error("provider secret-token leaked")),
        },
        thinkUseCase: {
          taskId: "think",
          invoke: jest.fn(),
        },
        autofixUseCase: {
          taskId: "autofix",
          invoke: jest.fn(),
        },
        doUserRequestUseCase: {
          taskId: "do-user-request",
          invoke: jest.fn(),
        },
        userComment: "@vypbot fix it",
        bugbotGitMutationPort: {} as never,
      },
      authorization,
      {} as never,
    );

    expect(results[0]).toBe(languageResult);
    expect(results.at(-1)).toMatchObject({
      id: "CommentAutomation",
      success: false,
      executed: true,
      errors: [
        expect.objectContaining({ message: "Comment automation failed." }),
      ],
    });
    expect(JSON.stringify(results)).not.toContain("secret-token");
    expect(authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
  });

  it('routes an explicit planning command directly to Think without intent detection', async () => {
    const language = { invoke: jest.fn().mockResolvedValue([]) };
    const intent = { invoke: jest.fn().mockResolvedValue([]) };
    const think = { invoke: jest.fn().mockResolvedValue([successfulResult('think')]) };

    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: language as never,
        intentUseCase: intent as never,
        thinkUseCase: think as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot plan',
        bugbotGitMutationPort: {} as never,
      },
      { isActorAllowedToModifyFiles: jest.fn() },
      {} as never,
    );

    expect(results.map(result => result.id)).toEqual(['CommentAutomation.ExplicitCommand', 'think']);
    expect(think.invoke).toHaveBeenCalledTimes(1);
    expect(language.invoke).not.toHaveBeenCalled();
    expect(intent.invoke).not.toHaveBeenCalled();
  });

  it('returns static help without invoking language or intent agents', async () => {
    const language = { invoke: jest.fn() };
    const intent = { invoke: jest.fn() };
    const think = { invoke: jest.fn() };

    const results = await runCommentAutomation(
      {
        owner: 'o',
        repo: 'r',
        actor: 'actor',
        tokenUser: 'vypbot',
        tokens: { token: 't' },
      } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: language as never,
        intentUseCase: intent as never,
        thinkUseCase: think as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot help',
        bugbotGitMutationPort: {} as never,
      },
      {} as never,
      {} as never,
    );

    expect(results[0]).toMatchObject({
      id: 'CommentAutomation.Help',
      success: true,
      stepFormat: 'markdown',
    });
    expect(results[0].steps[0]).toContain('@vypbot');
    expect(language.invoke).not.toHaveBeenCalled();
    expect(intent.invoke).not.toHaveBeenCalled();
    expect(think.invoke).not.toHaveBeenCalled();
  });

  it('returns the projected status without invoking language or intent agents', async () => {
    const language = { invoke: jest.fn() };
    const intent = { invoke: jest.fn() };
    const think = { invoke: jest.fn() };

    const results = await runCommentAutomation(
      {
        owner: 'o',
        repo: 'r',
        actor: 'actor',
        tokenUser: 'vypbot',
        tokens: { token: 't' },
      } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: language as never,
        intentUseCase: intent as never,
        thinkUseCase: think as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot status',
        bugbotGitMutationPort: {} as never,
      },
      {} as never,
      {} as never,
    );

    expect(results[0]).toMatchObject({
      id: 'CommentAutomation.Status',
      success: true,
      executed: true,
      stepFormat: 'markdown',
    });
    expect(language.invoke).not.toHaveBeenCalled();
    expect(intent.invoke).not.toHaveBeenCalled();
    expect(think.invoke).not.toHaveBeenCalled();
  });

  it.each([
    ['/copilot sync-branch --from release/3', 'release/3'],
  ])('routes authorized branch synchronization directly: %s', async (userComment, parentOverride) => {
    const sync = { invoke: jest.fn().mockResolvedValue([successfulResult('sync')]) };
    const language = { invoke: jest.fn() };
    const intent = { invoke: jest.fn() };
    const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) };
    const execution = { owner: 'o', repo: 'r', actor: 'alice', tokens: { token: 't' } } as Execution;

    const results = await runCommentAutomation(
      execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: language as never,
        intentUseCase: intent as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        syncBranchUseCase: sync as never,
        userComment,
        bugbotGitMutationPort: {} as never,
      },
      authorization,
      {} as never,
    );

    expect(results[0].id).toBe('sync');
    expect(sync.invoke).toHaveBeenCalledWith({ dryRun: false, useAgent: true, parentOverride });
    expect(language.invoke).not.toHaveBeenCalled();
    expect(intent.invoke).not.toHaveBeenCalled();
  });

  it("recognizes the mentioned branch-sync phrase without invoking intent detection", async () => {
    const sync = { invoke: jest.fn().mockResolvedValue([successfulResult('sync')]) };
    const intent = { invoke: jest.fn() };
    const execution = {
      owner: 'o', repo: 'r', actor: 'alice', tokenUser: 'vypbot', tokens: { token: 't' },
    } as Execution;
    const results = await runCommentAutomation(
      execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: { invoke: jest.fn() } as never,
        intentUseCase: intent as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        syncBranchUseCase: sync as never,
        userComment: "@vypbot update the issue's branch",
        bugbotGitMutationPort: {} as never,
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) },
      {} as never,
    );

    expect(results[0].id).toBe('sync');
    expect(intent.invoke).not.toHaveBeenCalled();
  });

  it("returns an inert result without provider work when the comment does not address Copilot", async () => {
    const language = { invoke: jest.fn() };
    const intent = { invoke: jest.fn() };
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'alice', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: language as never,
        intentUseCase: intent as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: 'plain comment',
        bugbotGitMutationPort: {} as never,
      },
      {} as never,
      {} as never,
    );

    expect(results).toEqual([expect.objectContaining({
      id: 'CommentAutomation',
      success: true,
      executed: false,
    })]);
    expect(language.invoke).not.toHaveBeenCalled();
    expect(intent.invoke).not.toHaveBeenCalled();
  });

  it("rejects unauthorized or invalid branch-sync commands before mutation", async () => {
    const sync = { invoke: jest.fn() };
    const baseOptions = {
      taskId: 'CommentAutomation',
      languageUseCase: {} as never,
      intentUseCase: {} as never,
      thinkUseCase: {} as never,
      autofixUseCase: {} as never,
      doUserRequestUseCase: {} as never,
      syncBranchUseCase: sync as never,
      bugbotGitMutationPort: {} as never,
    };
    const execution = { owner: 'o', repo: 'r', actor: 'alice', tokens: { token: 't' } } as Execution;
    const unauthorized = await runCommentAutomation(
      execution,
      { ...baseOptions, userComment: '/copilot sync-branch' },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false) },
      {} as never,
    );
    expect(unauthorized[0]).toMatchObject({ success: true, executed: false });

    const invalid = await runCommentAutomation(
      execution,
      { ...baseOptions, userComment: '/copilot sync-branch --force' },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) },
      {} as never,
    );
    expect(invalid[0]).toMatchObject({ success: false, executed: false });
    expect(sync.invoke).not.toHaveBeenCalled();
  });

  it("reports branch synchronization as unavailable when the composition omits it", async () => {
    const authorization = { isActorAllowedToModifyFiles: jest.fn() };
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'alice', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot sync-branch',
        bugbotGitMutationPort: {} as never,
      },
      authorization,
      {} as never,
    );

    expect(results[0]).toMatchObject({
      id: 'CommentAutomation.BranchSync',
      success: false,
      executed: false,
    });
    expect(authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
  });

  it("honors ai-members-only before invoking comment automation", async () => {
    const language = { invoke: jest.fn() };
    const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false) };
    const results = await runCommentAutomation(
      {
        owner: 'o',
        repo: 'r',
        actor: 'outsider',
        tokenUser: 'vypbot',
        tokens: { token: 't' },
        ai: configuredAi({ membersOnly: true }),
      } as unknown as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: language as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '@vypbot please inspect this',
        bugbotGitMutationPort: {} as never,
      },
      authorization,
      {} as never,
    );

    expect(results[0]).toMatchObject({ success: true, executed: false });
    expect(authorization.isActorAllowedToModifyFiles).toHaveBeenCalledWith('o', 'r', 'outsider', 't');
    expect(language.invoke).not.toHaveBeenCalled();
  });

  it('routes explicit review commands to the read-only Bugbot review use case', async () => {
    const review = { invoke: jest.fn().mockResolvedValue([successfulResult('review')]) };
    const think = { invoke: jest.fn() };
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: think as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        reviewPotentialProblemsUseCase: review as never,
        userComment: '/copilot recheck',
        bugbotGitMutationPort: {} as never,
      },
      {} as never,
      {} as never,
    );

    expect(results.map(result => result.id)).toEqual(['CommentAutomation.ExplicitCommand', 'review']);
    expect(review.invoke).toHaveBeenCalledTimes(1);
    expect(think.invoke).not.toHaveBeenCalled();
  });

  it('reports when an explicit analysis command has no review composition', async () => {
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot analyze',
        bugbotGitMutationPort: {} as never,
      },
      {} as never,
      {} as never,
    );

    expect(results.at(-1)).toMatchObject({
      id: 'CommentAutomation.Review',
      success: false,
      executed: true,
    });
  });

  it('routes a mentioned natural-language analysis request to the read-only review use case', async () => {
    const review = { invoke: jest.fn().mockResolvedValue([successfulResult('review')]) };
    const intent = {
      invoke: jest.fn().mockResolvedValue([successfulResult('intent', {
        isFixRequest: false,
        isDoRequest: false,
        isReviewRequest: true,
        targetFindingIds: [],
      })]),
    };
    const think = { invoke: jest.fn() };

    const results = await runCommentAutomation(
      {
        owner: 'o',
        repo: 'r',
        actor: 'actor',
        tokenUser: 'vypbot',
        tokens: { token: 't' },
      } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: { invoke: jest.fn().mockResolvedValue([]) } as never,
        intentUseCase: intent as never,
        thinkUseCase: think as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        reviewPotentialProblemsUseCase: review as never,
        userComment: '@VYPBOT analyze the changes for security issues',
        bugbotGitMutationPort: {} as never,
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false) } as never,
      {} as never,
    );

    expect(results.map(result => result.id)).toEqual(['intent', 'review']);
    expect(review.invoke).toHaveBeenCalledTimes(1);
    expect(think.invoke).not.toHaveBeenCalled();
  });

  it('keeps an explicit implement request on the authorized mutation route', async () => {
    const doUserRequest = { invoke: jest.fn().mockResolvedValue([]) };
    const intent = {
      invoke: jest.fn().mockResolvedValue([successfulResult('intent', {
        isFixRequest: false,
        isDoRequest: true,
        isReviewRequest: false,
        targetFindingIds: [],
        requestText: 'add a regression test',
      })]),
    };

    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: { invoke: jest.fn().mockResolvedValue([]) } as never,
        intentUseCase: intent as never,
        thinkUseCase: { invoke: jest.fn() } as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: doUserRequest as never,
        userComment: '/copilot implement add a regression test',
        bugbotGitMutationPort: {} as never,
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
    );

    expect(doUserRequest.invoke).toHaveBeenCalledWith(expect.objectContaining({
      userComment: 'add a regression test',
    }));
    expect(results).toContainEqual(expect.objectContaining({ id: 'intent' }));
  });

  it('routes explicit PR description commands without language or intent detection', async () => {
    const description = { invoke: jest.fn().mockResolvedValue([successfulResult('description')]) };
    const language = { invoke: jest.fn() };
    const intent = { invoke: jest.fn() };
    const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) };
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: language as never,
        intentUseCase: intent as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot description',
        bugbotGitMutationPort: {} as never,
        updatePullRequestDescriptionUseCase: description,
      },
      authorization,
      {} as never,
    );

    expect(results).toEqual([expect.objectContaining({ id: 'description' })]);
    expect(description.invoke).toHaveBeenCalledTimes(1);
    expect(language.invoke).not.toHaveBeenCalled();
    expect(intent.invoke).not.toHaveBeenCalled();
  });

  it('skips explicit PR description commands when the actor is not authorized', async () => {
    const description = { invoke: jest.fn() };
    const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false) };

    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot description',
        bugbotGitMutationPort: {} as never,
        updatePullRequestDescriptionUseCase: description,
      },
      authorization,
      {} as never,
    );

    expect(description.invoke).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({
      id: 'CommentAutomation.Description',
      success: true,
      executed: false,
    });
  });

  it('reports when an explicit PR description command is unavailable', async () => {
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot description',
        bugbotGitMutationPort: {} as never,
      },
      {} as never,
      {} as never,
    );

    expect(results.at(-1)).toMatchObject({
      id: 'CommentAutomation.Description',
      success: false,
      executed: false,
    });
  });

  it('rejects an invalid explicit command without invoking an agent', async () => {
    const think = { invoke: jest.fn() };
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: think as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot execute-shell rm -rf',
        bugbotGitMutationPort: {} as never,
      },
      {} as never,
      {} as never,
    );

    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(think.invoke).not.toHaveBeenCalled();
  });

  it('delegates explicit dismiss commands only after authorization', async () => {
    const dismiss = { invoke: jest.fn().mockResolvedValue([successfulResult('dismiss')]) };
    const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) };
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        userComment: '/copilot dismiss FINDING-1',
        bugbotGitMutationPort: {} as never,
        dismissBugbotFindingsUseCase: dismiss as never,
      },
      authorization,
      {} as never,
    );

    expect(results).toEqual([expect.objectContaining({ id: 'dismiss' })]);
    expect(dismiss.invoke).toHaveBeenCalledWith(expect.objectContaining({ findingIds: ['FINDING-1'] }));
  });

  it('skips explicit dismiss commands when the actor is not authorized', async () => {
    const authorization = { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false) };
    const dismiss = { invoke: jest.fn() };
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        dismissBugbotFindingsUseCase: dismiss as never,
        userComment: '/copilot dismiss FINDING-1',
        bugbotGitMutationPort: {} as never,
      },
      authorization as never,
      {} as never,
    );

    expect(dismiss.invoke).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, executed: false });
  });

  it('commits an explicitly remembered rule using only its exact guarded path', async () => {
    const remember = { invoke: jest.fn().mockResolvedValue([successfulResult('remember')]) };
    const statusOutputs = ['', '?? .copilot/BUGBOT.learned.md\n', '?? .copilot/BUGBOT.learned.md\n'];
    const bugbotGitMutationPort = {
      execute: jest.fn((_program: string, args: string[], options?: { stdout?: (data: Buffer) => void }) => {
        if (args[0] === 'status') options?.stdout?.(Buffer.from(statusOutputs.shift() ?? ''));
        return Promise.resolve();
      }),
      configureAuthor: jest.fn().mockResolvedValue(undefined),
      stagePaths: jest.fn().mockResolvedValue(undefined),
      stageAll: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      push: jest.fn().mockResolvedValue(undefined),
    };
    const results = await runCommentAutomation(
      {
        owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' },
        commit: { branch: 'feature/1-safe' }, issueNumber: 1,
        ai: configuredAi({ fixVerifyCommands: [] }),
      } as unknown as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        rememberBugbotRuleUseCase: remember as never,
        userComment: '/copilot remember Prefer exact path validation',
        bugbotGitMutationPort: bugbotGitMutationPort as never,
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) } as never,
      { getTokenUserDetails: jest.fn().mockResolvedValue({ name: 'Bot', email: 'bot@example.com' }) } as never,
    );

    expect(remember.invoke).toHaveBeenCalledTimes(1);
    expect(bugbotGitMutationPort.stagePaths).toHaveBeenCalledWith(['.copilot/BUGBOT.learned.md']);
    expect(bugbotGitMutationPort.stageAll).not.toHaveBeenCalled();
    expect(results.at(-1)).toMatchObject({ id: 'DoUserRequestCommitAndPush', success: true });
  });

  it('refuses to remember a rule when the workspace is already dirty', async () => {
    const remember = { invoke: jest.fn() };
    const bugbotGitMutationPort = {
      execute: jest.fn((_program: string, args: string[], options?: { stdout?: (data: Buffer) => void }) => {
        if (args[0] === 'status') options?.stdout?.(Buffer.from(' M src/unrelated.ts\n'));
        return Promise.resolve();
      }),
    };
    const results = await runCommentAutomation(
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        rememberBugbotRuleUseCase: remember as never,
        userComment: '/copilot remember Do not hide failures',
        bugbotGitMutationPort: bugbotGitMutationPort as never,
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
    );

    expect(remember.invoke).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({
      id: 'CommentAutomation.Remember',
      success: false,
      errors: [expect.objectContaining({ message: expect.stringContaining('workspace is not clean') })],
    });
  });
});
