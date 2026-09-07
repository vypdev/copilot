import type { GitCommitPort } from "../../application/ports/git_ports";
import { BranchSyncWorkspaceAdapter } from "../branch_sync_workspace_adapter";

type Reply = string | number | Error;

function createGit(replies: Record<string, Reply[]> = {}) {
  const queues = new Map(Object.entries(replies).map(([key, values]) => [key, [...values]]));
  const execute = jest.fn(async (_program: string, args: string[], options?: { stdout?: (data: Buffer) => void }) => {
    const key = args.join(" ");
    const reply = queues.get(key)?.shift() ?? 0;
    if (reply instanceof Error) throw reply;
    if (typeof reply === "string") options?.stdout?.(Buffer.from(reply));
    return typeof reply === "number" ? reply : 0;
  });
  const git = {
    execute,
    fetch: jest.fn().mockResolvedValue(undefined),
    configureAuthor: jest.fn().mockResolvedValue(undefined),
    stageAll: jest.fn().mockResolvedValue(undefined),
    stagePaths: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    push: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<GitCommitPort>;
  return { git, execute };
}

const STATUS = "status --porcelain";
const UNRESOLVED = "diff --name-only --diff-filter=U -z";
const INDEX = "ls-files -s -z";

describe("BranchSyncWorkspaceAdapter", () => {
  it("returns an idempotent preparation when the parent is already an ancestor", async () => {
    const { git } = createGit({
      [STATUS]: [""],
      "rev-parse HEAD": ["child\n"],
      "rev-parse FETCH_HEAD": ["parent\n"],
      "merge-base --is-ancestor parent child": [0],
    });
    const adapter = new BranchSyncWorkspaceAdapter(git);

    await expect(adapter.prepare("develop", "feature/42", "token")).resolves.toEqual({
      kind: "aligned", parentSha: "parent", childSha: "child",
    });
    expect(git.fetch).toHaveBeenNthCalledWith(1, "feature/42", "token");
    expect(git.fetch).toHaveBeenNthCalledWith(2, "develop", "token");
  });

  it("prepares, validates, commits, and pushes a clean merge", async () => {
    const { git } = createGit({
      [STATUS]: ["", "M  src/a.ts\n", "M  src/a.ts\n"],
      "rev-parse HEAD": ["child\n", "child\n", "merge\n"],
      "rev-parse FETCH_HEAD": ["parent\n", "parent\n", "child\n"],
      "merge-base --is-ancestor parent child": [new Error("not ancestor")],
      [UNRESOLVED]: ["", ""],
      [INDEX]: ["100644 sha 0\tsrc/a.ts\0", "100644 sha 0\tsrc/a.ts\0"],
      "rev-parse MERGE_HEAD": ["parent\n"],
    });
    const adapter = new BranchSyncWorkspaceAdapter(git);

    await expect(adapter.prepare("develop", "feature/42", "token")).resolves.toMatchObject({ kind: "clean" });
    await expect(adapter.validatePreparedMerge([])).resolves.toEqual({ valid: true });
    await expect(adapter.assertRemoteHeadsUnchanged("develop", "parent", "feature/42", "child", "token"))
      .resolves.toEqual({ valid: true });
    await expect(adapter.commitAndPush(
      "feature/42", "Merge develop into feature/42", { name: "Bot", email: "bot@example.com" }, "token",
    )).resolves.toBe("merge");
    expect(git.configureAuthor).toHaveBeenCalledWith("Bot", "bot@example.com");
    expect(git.stageAll).toHaveBeenCalled();
    expect(git.commit).toHaveBeenCalledWith("Merge develop into feature/42");
    expect(git.push).toHaveBeenCalledWith("feature/42", "token");
  });

  it("accepts a conflict resolution only when HEAD, MERGE_HEAD, paths, and protected index entries remain safe", async () => {
    const conflictedIndex = [
      "100644 base 1\tsrc/a.ts",
      "100644 ours 2\tsrc/a.ts",
      "100644 theirs 3\tsrc/a.ts",
      "100644 stable 0\tsrc/b.ts",
    ].join("\0") + "\0";
    const resolvedIndex = [
      "100644 resolved 0\tsrc/a.ts",
      "100644 stable 0\tsrc/b.ts",
    ].join("\0") + "\0";
    const { git } = createGit({
      [STATUS]: ["", "UU src/a.ts\nM  src/b.ts\n", "M  src/a.ts\nM  src/b.ts\n"],
      "rev-parse HEAD": ["child\n", "child\n"],
      "rev-parse FETCH_HEAD": ["parent\n"],
      "merge-base --is-ancestor parent child": [new Error("not ancestor")],
      "merge --no-ff --no-commit parent": [new Error("conflicts")],
      [UNRESOLVED]: ["src/a.ts\0", ""],
      [INDEX]: [conflictedIndex, resolvedIndex],
      "rev-parse MERGE_HEAD": ["parent\n"],
    });
    const adapter = new BranchSyncWorkspaceAdapter(git);

    await expect(adapter.prepare("develop", "feature/42", "token")).resolves.toEqual({
      kind: "conflicted", parentSha: "parent", childSha: "child", conflictPaths: ["src/a.ts"],
    });
    await expect(adapter.validatePreparedMerge(["src/a.ts"])).resolves.toEqual({ valid: true });
  });

  it("rejects unsafe preparation and post-resolution changes", async () => {
    const dirty = createGit({ [STATUS]: ["M  existing.ts\n"] });
    await expect(new BranchSyncWorkspaceAdapter(dirty.git).prepare("develop", "feature/42", "token"))
      .rejects.toThrow("clean workspace");

    const invalid = createGit();
    await expect(new BranchSyncWorkspaceAdapter(invalid.git).prepare("-danger", "feature/42", "token"))
      .rejects.toThrow("Invalid branch name");

    const changed = createGit({
      [STATUS]: ["", "M  src/a.ts\n"],
      "rev-parse HEAD": ["child\n", "changed\n"],
      "rev-parse FETCH_HEAD": ["parent\n"],
      "merge-base --is-ancestor parent child": [new Error("not ancestor")],
      [UNRESOLVED]: [""],
      [INDEX]: ["100644 sha 0\tsrc/a.ts\0"],
    });
    const adapter = new BranchSyncWorkspaceAdapter(changed.git);
    await adapter.prepare("develop", "feature/42", "token");
    await expect(adapter.validatePreparedMerge([])).resolves.toEqual({ valid: false, reason: "The agent changed HEAD." });
  });

  it("aborts a failed merge without conflicts and detects remote races", async () => {
    const failed = createGit({
      [STATUS]: [""],
      "rev-parse HEAD": ["child\n"],
      "rev-parse FETCH_HEAD": ["parent\n"],
      "merge-base --is-ancestor parent child": [new Error("not ancestor")],
      "merge --no-ff --no-commit parent": [new Error("failed")],
      [UNRESOLVED]: [""],
    });
    const failedAdapter = new BranchSyncWorkspaceAdapter(failed.git);
    await expect(failedAdapter.prepare("develop", "feature/42", "token")).rejects.toThrow("could not prepare");
    expect(failed.execute).toHaveBeenCalledWith("git", ["merge", "--abort"]);

    const raced = createGit({
      [STATUS]: ["", "M  src/a.ts\n"],
      "rev-parse HEAD": ["child\n"],
      "rev-parse FETCH_HEAD": ["parent\n", "new-parent\n"],
      "merge-base --is-ancestor parent child": [new Error("not ancestor")],
      [UNRESOLVED]: [""],
      [INDEX]: ["100644 sha 0\tsrc/a.ts\0"],
    });
    const racedAdapter = new BranchSyncWorkspaceAdapter(raced.git);
    await racedAdapter.prepare("develop", "feature/42", "token");
    await expect(racedAdapter.assertRemoteHeadsUnchanged("develop", "parent", "feature/42", "child", "token"))
      .resolves.toEqual({ valid: false, reason: "Parent branch develop changed during synchronization." });
    await racedAdapter.abort();
    expect(raced.execute).toHaveBeenCalledWith("git", ["merge", "--abort"]);
  });
});
