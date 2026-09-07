import {
  isNaturalLanguageBranchSyncRequest,
  parseBranchSyncCommandArguments,
} from "../branch_sync_command";

describe("branch sync command", () => {
  it("parses safe optional controls", () => {
    expect(parseBranchSyncCommandArguments(["--dry-run", "--no-agent", "--from", "release/2"])).toEqual({
      valid: true,
      options: { dryRun: true, useAgent: false, parentOverride: "release/2" },
    });
    expect(parseBranchSyncCommandArguments(["--from=develop"])).toEqual({
      valid: true,
      options: { dryRun: false, useAgent: true, parentOverride: "develop" },
    });
  });

  it("rejects missing and unsupported values", () => {
    expect(parseBranchSyncCommandArguments(["--from"])).toMatchObject({ valid: false });
    expect(parseBranchSyncCommandArguments(["--force"])).toMatchObject({ valid: false });
  });

  it.each([
    "@vypbot update the issue's branch",
    "@VYPBOT synchronize the branch please",
    "@vypbot actualiza la rama de esta issue",
  ])("recognizes a mentioned natural-language request: %s", (message) => {
    expect(isNaturalLanguageBranchSyncRequest(message, "vypbot")).toBe(true);
  });

  it("requires the configured bot mention and an exact synchronization intent", () => {
    expect(isNaturalLanguageBranchSyncRequest("update the issue's branch", "vypbot")).toBe(false);
    expect(isNaturalLanguageBranchSyncRequest("@other update the issue's branch", "vypbot")).toBe(false);
    expect(isNaturalLanguageBranchSyncRequest("@vypbot explain the branch", "vypbot")).toBe(false);
    expect(isNaturalLanguageBranchSyncRequest("@vypbot sync branch", "")).toBe(false);
  });
});
