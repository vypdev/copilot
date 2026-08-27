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
        userComment: "fix it",
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
});
