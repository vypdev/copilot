import type { Execution } from "../../../../../../data/model/execution";
import type { Result } from "../../../../../../data/model/result";
import { commitAutofixAndResolveFindings } from "../commit_autofix_and_resolve_workflow";

jest.mock("../bugbot_autofix_commit", () => ({
  runBugbotAutofixCommitAndPush: jest.fn(),
}));

jest.mock("../mark_findings_resolved_use_case", () => ({
  markFindingsResolved: jest.fn(),
}));

jest.mock("../../../../../ports/logging_ports", () => ({
  logInfo: jest.fn(),
}));

const { runBugbotAutofixCommitAndPush } = require("../bugbot_autofix_commit");
const { markFindingsResolved } = require("../mark_findings_resolved_use_case");
const { logInfo } = require("../../../../../ports/logging_ports");

describe("commitAutofixAndResolveFindings", () => {
  beforeEach(() => {
    runBugbotAutofixCommitAndPush.mockReset();
    markFindingsResolved.mockReset();
    logInfo.mockReset();
  });

  it("keeps committed findings open until a fresh review verifies them", async () => {
    runBugbotAutofixCommitAndPush.mockResolvedValue({ success: true, committed: true });

    const errors = await commitAutofixAndResolveFindings(
      { owner: "o", repo: "r" } as Execution,
      {
        branchOverride: "bugfix",
        targetFindingIds: ["finding-1"],
        context: {},
      } as never,
      [{ success: true, payload: {} } as Result],
      {} as never,
      {} as never,
    );

    expect(errors).toEqual([]);
    expect(markFindingsResolved).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining("remain open until a fresh review"));
  });

  it("does not resolve findings when no commit was created", async () => {
    runBugbotAutofixCommitAndPush.mockResolvedValue({ success: true, committed: false });

    await expect(
      commitAutofixAndResolveFindings(
        { owner: "o", repo: "r" } as Execution,
        {
          targetFindingIds: ["finding-1"],
          context: {},
        } as never,
        [{ success: true, payload: {} } as Result],
        {} as never,
        {} as never,
      ),
    ).resolves.toEqual([]);

    expect(markFindingsResolved).not.toHaveBeenCalled();
  });

  it("returns a sanitized error when commit or push fails", async () => {
    runBugbotAutofixCommitAndPush.mockResolvedValue({
      success: false,
      committed: false,
      error: "push failed with token=secret-value",
    });

    const errors = await commitAutofixAndResolveFindings(
      { owner: "o", repo: "r" } as Execution,
      { targetFindingIds: ["finding-1"], context: {} } as never,
      [{ success: true, payload: {} } as Result],
      {} as never,
      {} as never,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].message).not.toContain("secret-value");
    expect(markFindingsResolved).not.toHaveBeenCalled();
  });

  it("does not resolve findings when the committed autofix has no context", async () => {
    runBugbotAutofixCommitAndPush.mockResolvedValue({ success: true, committed: true });

    await expect(
      commitAutofixAndResolveFindings(
        { owner: "o", repo: "r" } as Execution,
        { targetFindingIds: ["finding-1"] } as never,
        [{ success: true, payload: {} } as Result],
        {} as never,
        {} as never,
      ),
    ).resolves.toEqual([]);

    expect(markFindingsResolved).not.toHaveBeenCalled();
  });

  it("does not optimistically resolve a successful committed autofix", async () => {
    runBugbotAutofixCommitAndPush.mockResolvedValue({ success: true, committed: true });
    markFindingsResolved.mockResolvedValue([]);

    await expect(
      commitAutofixAndResolveFindings(
        { owner: "o", repo: "r" } as Execution,
        {
          targetFindingIds: ["finding-1"],
          context: {},
        } as never,
        [{ success: true, payload: {} } as Result],
        {} as never,
        {} as never,
      ),
    ).resolves.toEqual([]);

    expect(markFindingsResolved).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining("remain open until a fresh review"));
  });
});
