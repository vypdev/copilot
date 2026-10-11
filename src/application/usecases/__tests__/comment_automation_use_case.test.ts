import { Result } from "../../../data/model/result";
import type { Execution } from "../../../data/model/execution";
import { Ai } from "../../../data/model/ai";
import { runCommentAutomation as runCommentAutomationImpl } from "../comment_automation_use_case";
import type { CommentAutomationOptions } from '../comment_automation_contracts';
import type { ActorAuthorizationPort } from '../../ports/actor_authorization_ports';
import { projectCommentAutomationContext } from '../comment_automation_context';
import { CommentLanguageTranslationWorkflow, projectCommentLanguageRequest } from '../steps/common/comment_language_translation_workflow';

type TestActorAuthorizationPort = Pick<ActorAuthorizationPort, 'isActorAllowedToModifyFiles'>
  & Partial<Pick<ActorAuthorizationPort, 'isActorAllowedToUseMemberOnlyAutomation'>>;

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
  actorAuthorizationPort: TestActorAuthorizationPort,
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
    locale: execution.locale ?? { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
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
      trustedBotLogin: source.tokenUser,
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
    isActorAllowedToUseMemberOnlyAutomation: (actor) => (
      actorAuthorizationPort.isActorAllowedToUseMemberOnlyAutomation
      ?? actorAuthorizationPort.isActorAllowedToModifyFiles
    )(
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

  it.each([false, true])('routes literal fix identifiers without language adaptation (intent failure: %s)', async failure => {
    const id = 'docs/área.mdx:28:awaiting-maintainer treated as failure';
    const userComment = `/copilot fix ${JSON.stringify(id)}`;
    const language = { invoke: jest.fn().mockResolvedValue([]) };
    const intent = { invoke: jest.fn().mockResolvedValue([successfulResult('intent', {
      isFixRequest: true, isDoRequest: false, targetFindingIds: [id], context: {},
    })]) };
    const autofix = { invoke: jest.fn().mockResolvedValue([successfulResult('autofix')]) };
    if (failure) intent.invoke.mockRejectedValueOnce(new Error('private provider diagnostic'));
    commitAutofixAndResolveFindings.mockResolvedValue([]);
    const results = await runCommentAutomation({ owner: 'o', repo: 'r', actor: 'actor',
      tokens: { token: 't' }, isPullRequest: true, eventName: 'pull_request_review_comment',
      commit: { branch: '' }, pullRequest: { number: 460, head: 'docs/work', isPullRequestReviewComment: true, commentBody: userComment },
    } as unknown as Execution, {
      taskId: 'CommentAutomation', languageUseCase: language as never, intentUseCase: intent as never,
      thinkUseCase: {} as never, autofixUseCase: autofix as never, doUserRequestUseCase: {} as never, userComment,
    }, { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) } as never);
    expect(language.invoke).not.toHaveBeenCalled();
    expect(intent.invoke).toHaveBeenCalledWith(expect.objectContaining({ comment: expect.objectContaining({ body: userComment }) }));
    if (failure) {
      expect(autofix.invoke).not.toHaveBeenCalled();
      expect(results.at(-1)).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'workflow.failed' })] });
    } else {
      expect(autofix.invoke).toHaveBeenCalledWith(expect.objectContaining({ targetFindingIds: [id] }));
      expect(results.every(result => result.success)).toBe(true);
    }
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
    ['/copilot sync-branch --from main', 'main'],
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
    const authorization = {
      isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true),
      isActorAllowedToUseMemberOnlyAutomation: jest.fn().mockResolvedValue(false),
    };
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
    expect(authorization.isActorAllowedToUseMemberOnlyAutomation).toHaveBeenCalledWith('o', 'r', 'outsider', 't');
    expect(authorization.isActorAllowedToModifyFiles).not.toHaveBeenCalled();
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

  it('stops an expanded translated command before intent, answer, or mutation', async () => {
    const workflow = new CommentLanguageTranslationWorkflow({ query: jest.fn().mockResolvedValue({
      status: 'translated', sourceLocale: 'es', targetLocale: 'en-US',
      adaptedText: 'word '.repeat(21).trim(), reasonCode: 'none',
    }) });
    const intent = { invoke: jest.fn() };
    const think = { invoke: jest.fn() };
    const mutation = { invoke: jest.fn() };
    const results = await runCommentAutomation(
      { actor: 'actor', tokenUser: 'vypbot', isPullRequest: true, tokens: { token: 't' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: { taskId: 'language', invoke: request => workflow.invoke({ ...request, taskId: 'language' }) },
        intentUseCase: intent as never, thinkUseCase: think as never,
        autofixUseCase: mutation as never, doUserRequestUseCase: mutation as never,
        userComment: '/copilot implement aclara el requisito',
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) } as never,
    );
    expect(results[0].success).toBe(false);
    expect(intent.invoke).not.toHaveBeenCalled();
    expect(think.invoke).not.toHaveBeenCalled();
    expect(mutation.invoke).not.toHaveBeenCalled();
  });

  it('retains the trusted mention through context projection and real language adaptation', async () => {
    const workflow = new CommentLanguageTranslationWorkflow({ query: jest.fn().mockResolvedValue({
      status: 'translated', sourceLocale: 'es', targetLocale: 'en-US',
      adaptedText: 'add a test', reasonCode: 'none',
    }) });
    const intent = { invoke: jest.fn().mockResolvedValue([successfulResult('intent', {
      isFixRequest: false, isDoRequest: true, targetFindingIds: [], requestText: 'add a test',
    })]) };
    const mutation = { invoke: jest.fn().mockResolvedValue([]) };
    const results = await runCommentAutomation(
      { actor: 'actor', tokenUser: 'vypbot', isPullRequest: true, tokens: { token: 't' }, pullRequest: { number: 77, head: 'feature/42-managed' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: { taskId: 'language', invoke: request => workflow.invoke({ ...request, taskId: 'language' }) },
        intentUseCase: intent as never, thinkUseCase: { invoke: jest.fn() } as never,
        autofixUseCase: {} as never, doUserRequestUseCase: mutation as never,
        rememberBranchPorts: { pullRequests: { getPullRequest: jest.fn().mockResolvedValue({
          number: 77, state: 'open', draft: false, baseRepository: { owner: 'o', name: 'r' },
          headRepositoryOwner: 'o', headRepositoryName: 'r', headRef: 'feature/42-managed', headSha: 'a'.repeat(40),
        }) } } as never,
        userComment: '@vypbot añade una prueba',
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) } as never,
    );
    expect(intent.invoke).toHaveBeenCalledWith(expect.objectContaining({
      comment: expect.objectContaining({ body: '@vypbot add a test' }),
    }));
    expect(results).toEqual([expect.objectContaining({ id: 'language' }), expect.objectContaining({ id: 'intent' })]);
    expect(mutation.invoke).toHaveBeenCalledTimes(1);
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
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' }, issueNumber: 42, issue: { number: 42 }, commit: { branch: 'feature/42-managed' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: { invoke: jest.fn().mockResolvedValue([]) } as never,
        intentUseCase: intent as never,
        thinkUseCase: { invoke: jest.fn() } as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: doUserRequest as never,
        rememberBranchPorts: { linkedBranches: { getLinkedBranch: jest.fn().mockResolvedValue({ name: 'feature/42-managed', headSha: 'a'.repeat(40) }) } } as never,
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
    const dismiss = { taskId: 'DismissBugbotFindings', invoke: jest.fn().mockResolvedValue([successfulResult('dismiss')]) };
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

  it('passes a quoted multiword finding ID losslessly to deterministic dismissal', async () => {
    const id = 'docs/issues/first-workflow.mdx:28:awaiting-maintainer treated as failure';
    const dismiss = { taskId: 'DismissBugbotFindings', invoke: jest.fn().mockResolvedValue([successfulResult('dismiss')]) };
    await runCommentAutomation({ owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' } } as Execution, {
      taskId: 'CommentAutomation', languageUseCase: {} as never, intentUseCase: {} as never,
      thinkUseCase: {} as never, autofixUseCase: {} as never, doUserRequestUseCase: {} as never,
      dismissBugbotFindingsUseCase: dismiss,
      userComment: `/copilot dismiss ${JSON.stringify(id)}`,
    }, { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) });
    expect(dismiss.invoke).toHaveBeenCalledWith(expect.objectContaining({ findingIds: [id] }));
  });

  it.each([0, 1, undefined])('publishes only a verified dismissal count (%s)', async count => {
    const dismissed = new Result({ id: 'DismissBugbotFindingsUseCase', success: count !== undefined,
      executed: true, payload: { dismissedCount: count } });
    const results = await runCommentAutomation({
      owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' },
      commit: { branch: 'feature/work' }, issueNumber: 7, ai: configuredAi(),
    } as unknown as Execution, {
      taskId: 'CommentAutomation', languageUseCase: {} as never, intentUseCase: {} as never,
      thinkUseCase: {} as never, autofixUseCase: {} as never, doUserRequestUseCase: {} as never,
      dismissBugbotFindingsUseCase: { invoke: jest.fn().mockResolvedValue([dismissed]) } as never,
      userComment: '/copilot dismiss "finding with spaces"',
    }, { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) } as never);
    if (count === undefined) expect(results).toEqual([dismissed]);
    else expect(results.at(-1)?.payload).toEqual({ publication: { kind: 'state-command-result', command: 'dismiss', outcome: 'completed', count } });
  });

  function rememberFixture(settings: {
    duplicate?: boolean;
    changedPaths?: string;
    checkoutFails?: boolean;
    verificationFails?: boolean;
    noPorts?: boolean;
    readFails?: boolean;
    identity?: Record<string, unknown>;
    noLinkedBranch?: boolean;
    linkedBranch?: { name: string; headSha: string };
    storeResults?: Result[];
  } = {}) {
    let changed = false;
    const remember = { invoke: jest.fn(async () => {
      changed = !settings.duplicate;
      return settings.storeResults ?? [new Result({ id: 'remember', success: true, executed: changed,
        payload: { learnedRule: changed ? 'created' : 'existing' } })];
    }) };
    const git = {
      execute: jest.fn(async (program: string, args: string[], options?: { stdout?: (data: Buffer) => void }) => {
        if (args[0] === 'status') {
          options?.stdout?.(Buffer.from(changed
            ? settings.changedPaths ?? '?? .copilot/BUGBOT.learned.md\n'
            : ''));
        }
        return program === 'pnpm' && settings.verificationFails ? 1 : 0;
      }),
      fetch: jest.fn(async () => { if (settings.checkoutFails) throw new Error('fetch unavailable'); }),
      configureAuthor: jest.fn().mockResolvedValue(undefined),
      stagePaths: jest.fn().mockResolvedValue(undefined),
      stageAll: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      push: jest.fn().mockResolvedValue(undefined),
    };
    const pullRequests = { getPullRequest: jest.fn(async () => {
      if (settings.readFails) throw new Error('provider read failed');
      return {
        number: 460, state: 'open', draft: true, baseRepository: { owner: 'o', name: 'r' },
        headRepositoryOwner: 'o', headRepositoryName: 'r', headRef: 'docs/453-workflow', headSha: 'a'.repeat(40),
        ...settings.identity,
      };
    }) };
    const linkedBranches = { getLinkedBranch: jest.fn(async (_number: number, branch: string) =>
      settings.noLinkedBranch ? undefined : settings.linkedBranch ?? { name: branch, headSha: 'a'.repeat(40) }) };
    const run = (execution: Partial<Execution> = {}) => runCommentAutomation(
      {
        owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' },
        commit: { branch: 'feature/1-safe' }, issueNumber: 1,
        ai: configuredAi({ fixVerifyCommands: ['pnpm run typecheck'] }),
        ...execution,
      } as unknown as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never, intentUseCase: {} as never,
        thinkUseCase: {} as never, autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        rememberBugbotRuleUseCase: remember as never,
        rememberBranchPorts: settings.noPorts ? undefined : { pullRequests, linkedBranches } as never,
        userComment: '/copilot remember Prefer exact path validation',
        bugbotGitMutationPort: git as never,
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) } as never,
    );
    return { remember, git, run, pullRequests, linkedBranches };
  }

  it.each([
    { label: 'issue branch', execution: {}, branch: 'feature/1-safe' },
    { label: 'persisted issue branch verified by its native link', execution: { commit: { branch: '' }, currentConfiguration: { workingBranch: 'feature/1-safe' } } as unknown as Partial<Execution>, branch: 'feature/1-safe' },
    { label: 'ordinary PR comment with no head fields', execution: { isPullRequest: true, commit: { branch: '' }, pullRequest: { number: 460, head: '' } } as unknown as Partial<Execution>, branch: 'docs/453-workflow' },
    {
      label: 'PR head with no commit-event branch',
      execution: {
        isPullRequest: true, commit: { branch: '' }, issueNumber: 453,
        pullRequest: { number: 460, head: 'docs/453-workflow' },
      } as unknown as Partial<Execution>,
      branch: 'docs/453-workflow',
    },
  ])('checks out the $label before remembering and verifies only the guarded path', async ({ execution, branch }) => {
    const { remember, git, run } = rememberFixture();
    const results = await run(execution);
    const checkoutIndex = git.execute.mock.calls.findIndex(([, args]) => args[0] === 'checkout');
    expect(git.fetch).toHaveBeenCalledWith(branch);
    expect(git.execute).toHaveBeenCalledWith('git', ['checkout', branch]);
    expect(git.execute.mock.invocationCallOrder[checkoutIndex]).toBeLessThan(remember.invoke.mock.invocationCallOrder[0]);
    expect(git.execute.mock.calls.filter(([, args]) => args[0] === 'checkout')).toHaveLength(1);
    expect(git.execute).toHaveBeenCalledWith('pnpm', ['run', 'typecheck'], { untrusted: true });
    expect(git.stagePaths).toHaveBeenCalledWith(['.copilot/BUGBOT.learned.md']);
    expect(git.stageAll).not.toHaveBeenCalled();
    expect(git.push).toHaveBeenCalledWith(branch);
    expect(results).toContainEqual(expect.objectContaining({ id: 'DoUserRequestCommitAndPush', success: true }));
    expect(results.at(-1)?.payload).toEqual({ publication: { kind: 'state-command-result', command: 'remember', outcome: 'saved', branch } });
  });

  const ordinaryPullRequestComment = {
    isPullRequest: true, commit: { branch: '' }, pullRequest: { number: 460, head: '' },
  } as unknown as Partial<Execution>;

  it.each([
    { label: 'wrong PR number', identity: { number: 461 }, code: 'workflow.stale' },
    { label: 'closed PR', identity: { state: 'closed' }, code: 'workflow.stale' },
    { label: 'foreign base repository', identity: { baseRepository: { owner: 'other', name: 'r' } }, code: 'workflow.stale' },
    { label: 'foreign head owner', identity: { headRepositoryOwner: 'fork-owner' }, code: 'workflow.invalid-event' },
    { label: 'same-owner foreign head repository', identity: { headRepositoryName: 'fork-repository' }, code: 'workflow.invalid-event' },
    { label: 'unknown head repository name', identity: { headRepositoryName: undefined }, code: 'workflow.invalid-event' },
  ])('rejects remember on $label before any workspace access', async ({ identity, code }) => {
    const { remember, git, run } = rememberFixture({ identity });
    const results = await run(ordinaryPullRequestComment);
    expect(results[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code })] });
    expect(remember.invoke).not.toHaveBeenCalled();
    expect(git.execute).not.toHaveBeenCalled();
  });

  it('requires canonical read capability before remembering a PR rule', async () => {
    const { remember, git, run } = rememberFixture({ noPorts: true });
    const results = await run(ordinaryPullRequestComment);
    expect(results[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'configuration.unsupported' })] });
    expect(remember.invoke).not.toHaveBeenCalled();
    expect(git.execute).not.toHaveBeenCalled();
  });

  it('does not remember when a canonical provider read fails', async () => {
    const { remember, git, run } = rememberFixture({ readFails: true });
    const results = await run(ordinaryPullRequestComment);
    expect(results[0].success).toBe(false);
    expect(remember.invoke).not.toHaveBeenCalled();
    expect(git.execute).not.toHaveBeenCalled();
  });

  it('does not query a missing pull-request conversation identity', async () => {
    const { pullRequests, git, run } = rememberFixture();
    const results = await run({ ...ordinaryPullRequestComment, pullRequest: { number: -1, head: '' } as never });
    expect(results[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'workflow.invalid-event' })] });
    expect(pullRequests.getPullRequest).not.toHaveBeenCalled();
    expect(git.execute).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'missing native link', settings: { noLinkedBranch: true } },
    { label: 'different branch link', settings: { linkedBranch: { name: 'other', headSha: 'a'.repeat(40) } } },
    { label: 'malformed linked revision', settings: { linkedBranch: { name: 'feature/1-safe', headSha: 'invalid' } } },
  ])('refuses remember on an issue with $label', async ({ settings }) => {
    const { git, remember, run } = rememberFixture(settings);
    const results = await run();
    expect(results[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'workflow.stale' })] });
    expect(git.execute).not.toHaveBeenCalled();
    expect(remember.invoke).not.toHaveBeenCalled();
  });

  it('requires native-link read capability before remembering an issue rule', async () => {
    const { git, run } = rememberFixture({ noPorts: true });
    expect((await run())[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'configuration.unsupported' })] });
    expect(git.execute).not.toHaveBeenCalled();
  });

  it('rejects branchless remember before inspecting or writing a workspace', async () => {
    const { remember, git, run } = rememberFixture();
    const results = await run({ commit: { branch: '' } as never });
    expect(remember.invoke).not.toHaveBeenCalled();
    expect(git.execute).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'workflow.invalid-event' })] });
  });

  it('does not store a rule when target checkout fails', async () => {
    const { remember, git, run } = rememberFixture({ checkoutFails: true });
    const results = await run();
    expect(remember.invoke).not.toHaveBeenCalled();
    expect(git.push).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'provider.unavailable' })] });
  });

  it('does not verify or commit an already remembered rule', async () => {
    const { git, run } = rememberFixture({ duplicate: true });
    const results = await run();
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ success: true, executed: false });
    expect(results.at(-1)?.payload).toEqual({ publication: { kind: 'state-command-result', command: 'remember', outcome: 'already-exists', branch: 'feature/1-safe' } });
    expect(git.execute.mock.calls.some(([program]) => program === 'pnpm')).toBe(false);
    expect(git.stagePaths).not.toHaveBeenCalled();
    expect(git.commit).not.toHaveBeenCalled();
    expect(git.push).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'empty', storeResults: [] },
    { label: 'unknown', storeResults: [new Result({ id: 'remember', success: true, executed: false })] },
    { label: 'failed', storeResults: [new Result({ id: 'remember', success: false, executed: false, payload: { learnedRule: 'existing' } })] },
  ])('does not infer an existing rule from a $label storage outcome', async ({ storeResults }) => {
    const { git, run } = rememberFixture({ duplicate: true, storeResults });
    const results = await run();
    expect(results).toEqual(storeResults);
    expect(git.commit).not.toHaveBeenCalled();
    expect(git.push).not.toHaveBeenCalled();
  });

  it('rejects unexpected paths written while remembering a rule', async () => {
    const { git, run } = rememberFixture({ changedPaths: '?? .copilot/BUGBOT.learned.md\n M docs/unrelated.mdx\n' });
    const results = await run();
    expect(results.at(-1)).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'agent.policy-rejected' })] });
    expect(git.stagePaths).not.toHaveBeenCalled();
    expect(git.push).not.toHaveBeenCalled();
  });

  it('does not publish a learned rule when verification fails', async () => {
    const { git, run } = rememberFixture({ verificationFails: true });
    const results = await run();
    expect(results.at(-1)).toMatchObject({ id: 'DoUserRequestCommitAndPush', success: false });
    expect(git.execute).toHaveBeenCalledWith('pnpm', ['run', 'typecheck'], { untrusted: true });
    expect(git.stagePaths).not.toHaveBeenCalled();
    expect(git.commit).not.toHaveBeenCalled();
    expect(git.push).not.toHaveBeenCalled();
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
      { owner: 'o', repo: 'r', actor: 'actor', tokens: { token: 't' }, commit: { branch: 'feature/1-safe' } } as Execution,
      {
        taskId: 'CommentAutomation',
        languageUseCase: {} as never,
        intentUseCase: {} as never,
        thinkUseCase: {} as never,
        autofixUseCase: {} as never,
        doUserRequestUseCase: {} as never,
        rememberBugbotRuleUseCase: remember as never,
        rememberBranchPorts: { linkedBranches: { getLinkedBranch: jest.fn().mockResolvedValue({ name: 'feature/1-safe', headSha: 'a'.repeat(40) }) } } as never,
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
