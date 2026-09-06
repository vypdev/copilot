import { Result } from "../../../data/model/result";
import type { Execution } from "../../../data/model/execution";
import { runCommentAutomation } from "../comment_automation_use_case";

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
      } as Execution,
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
        gitCommitPort: {} as never,
      },
      {
        isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true),
      },
      {} as never,
      {} as never,
    );

    expect(results).toContain(intentResult);
    expect(results).toContain(autofixResult);
    expect(results.at(-1)).toMatchObject({
      success: false,
      executed: true,
      errors: [resolutionError],
    });
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
        userComment: "fix it",
        gitCommitPort: {} as never,
      },
      authorization,
      {} as never,
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
        gitCommitPort: {} as never,
      },
      { isActorAllowedToModifyFiles: jest.fn() },
      {} as never,
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
        gitCommitPort: {} as never,
      },
      {} as never,
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
        gitCommitPort: {} as never,
      },
      {} as never,
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
        gitCommitPort: {} as never,
      },
      {} as never,
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
        gitCommitPort: {} as never,
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(false) } as never,
      {} as never,
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
        gitCommitPort: {} as never,
      },
      { isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {} as never,
    );

    expect(doUserRequest.invoke).toHaveBeenCalledWith(expect.objectContaining({
      userComment: 'add a regression test',
    }));
    expect(results).toContainEqual(expect.objectContaining({ id: 'intent' }));
  });

  it('routes explicit PR description commands without language or intent detection', async () => {
    const description = { invokeExplicit: jest.fn().mockResolvedValue([successfulResult('description')]) };
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
        gitCommitPort: {} as never,
        updatePullRequestDescriptionUseCase: description,
      },
      authorization,
      {} as never,
      {} as never,
    );

    expect(results).toEqual([expect.objectContaining({ id: 'description' })]);
    expect(description.invokeExplicit).toHaveBeenCalledTimes(1);
    expect(language.invoke).not.toHaveBeenCalled();
    expect(intent.invoke).not.toHaveBeenCalled();
  });

  it('skips explicit PR description commands when the actor is not authorized', async () => {
    const description = { invokeExplicit: jest.fn() };
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
        gitCommitPort: {} as never,
        updatePullRequestDescriptionUseCase: description,
      },
      authorization,
      {} as never,
      {} as never,
    );

    expect(description.invokeExplicit).not.toHaveBeenCalled();
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
        gitCommitPort: {} as never,
      },
      {} as never,
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
        gitCommitPort: {} as never,
      },
      {} as never,
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
        gitCommitPort: {} as never,
        dismissBugbotFindingsUseCase: dismiss as never,
      },
      authorization,
      {} as never,
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
        gitCommitPort: {} as never,
      },
      authorization as never,
      {} as never,
      {} as never,
    );

    expect(dismiss.invoke).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, executed: false });
  });
});
