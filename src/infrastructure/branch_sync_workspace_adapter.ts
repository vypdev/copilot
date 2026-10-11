import type {
  BranchMergePreparation,
  BranchSyncResolutionValidation,
  BranchSyncWorkspacePort,
} from "../application/ports/branch_sync_ports";
import type { GitCommitPort } from "../application/ports/git_ports";
import { listWorkspacePaths as inspectWorkspacePaths } from "../application/usecases/steps/commit/bugbot/workspace_changes";
import { refreshBranchSyncSddCatalog, SDD_CATALOG_INDEX_PATH, SDD_CATALOG_PATH } from './branch_sync_sdd_catalog';

interface MergeWorkspaceSnapshot {
  readonly parentSha: string;
  readonly childSha: string;
  readonly conflictPaths: readonly string[];
  readonly workspacePaths: readonly string[];
  readonly protectedIndexEntries: ReadonlyMap<string, string>;
}

/** Owns Git's merge state while keeping credentials confined to fetch/push subprocesses. */
export class BranchSyncWorkspaceAdapter implements BranchSyncWorkspacePort {
  private snapshot: MergeWorkspaceSnapshot | undefined;
  private mergeInProgress = false;
  private resolutionValidated = false;

  constructor(private readonly git: GitCommitPort, private readonly repositoryRoot: string = process.cwd()) {}

  async prepare(parentBranch: string, workingBranch: string, token: string): Promise<BranchMergePreparation> {
    this.snapshot = undefined;
    this.mergeInProgress = false;
    this.resolutionValidated = false;
    await this.assertValidBranch(parentBranch);
    await this.assertValidBranch(workingBranch);
    if ((await this.listWorkspacePaths()).length > 0) throw new Error("Branch synchronization requires a clean workspace.");

    await this.git.fetch(workingBranch, token);
    await this.git.execute("git", ["checkout", "-B", workingBranch, "FETCH_HEAD"]);
    const childSha = await this.read("git", ["rev-parse", "HEAD"]);
    await this.git.fetch(parentBranch, token);
    const parentSha = await this.read("git", ["rev-parse", "FETCH_HEAD"]);
    if (await this.isAncestor(parentSha, childSha)) return { kind: "aligned", parentSha, childSha };

    let mergeFailed = false;
    try {
      // Git requires an identity even for --no-commit. Keep preview identity
      // process-local; commitAndPush supplies the authorized final author.
      await this.git.execute("git", ["-c", "user.name=Copilot", "-c", "user.email=copilot@users.noreply.github.com",
        "merge", "--no-ff", "--no-commit", parentSha]);
    } catch {
      mergeFailed = true;
    }
    this.mergeInProgress = true;
    const conflictPaths = await this.readPaths(["diff", "--name-only", "--diff-filter=U", "-z"]);
    if (mergeFailed && conflictPaths.length === 0) {
      await this.abort();
      throw new Error("Git could not prepare the parent branch merge.");
    }

    let workspacePaths = await this.listWorkspacePaths();
    if (conflictPaths.length === 0 && workspacePaths.includes(SDD_CATALOG_PATH) && workspacePaths.includes(SDD_CATALOG_INDEX_PATH)) {
      if (!refreshBranchSyncSddCatalog(this.repositoryRoot)) throw new Error('The merged SDD catalog is invalid.');
      await this.git.stagePaths([SDD_CATALOG_INDEX_PATH]);
      workspacePaths = await this.listWorkspacePaths();
    }
    const indexEntries = await this.readIndexEntries();
    const conflicts = new Set(conflictPaths);
    this.snapshot = {
      parentSha,
      childSha,
      conflictPaths,
      workspacePaths,
      protectedIndexEntries: new Map([...indexEntries].filter(([path]) => !conflicts.has(path))),
    };
    return conflictPaths.length > 0
      ? { kind: "conflicted", parentSha, childSha, conflictPaths }
      : { kind: "clean", parentSha, childSha };
  }

  async validatePreparedMerge(conflictPaths: readonly string[]): Promise<BranchSyncResolutionValidation> {
    const snapshot = this.snapshot;
    if (!snapshot || !sameSet(snapshot.conflictPaths, conflictPaths)) return invalid("Merge state does not match the expected conflict set.");
    if (await this.read("git", ["rev-parse", "HEAD"]) !== snapshot.childSha) return invalid("The agent changed HEAD.");
    if (await this.read("git", ["rev-parse", "MERGE_HEAD"]) !== snapshot.parentSha) return invalid("The agent changed the merge parent.");
    const unresolved = await this.readPaths(["diff", "--name-only", "--diff-filter=U", "-z"]);
    if (unresolved.some(path => !conflictPaths.includes(path)) || (this.resolutionValidated && unresolved.length > 0)) {
      return invalid("Unresolved merge conflicts remain.");
    }
    if (!sameSet(await this.listWorkspacePaths(), snapshot.workspacePaths)) return invalid("The agent changed paths outside the prepared merge.");
    const unstaged = await this.readPaths(["diff", "--name-only", "-z"]);
    if (unstaged.some(path => !conflictPaths.includes(path)) || (this.resolutionValidated && unstaged.length > 0)) {
      return invalid("The prepared merge contains unstaged changes.");
    }

    const indexEntries = await this.readIndexEntries();
    for (const [path, entry] of snapshot.protectedIndexEntries) {
      if (indexEntries.get(path) !== entry) return invalid(`The agent changed non-conflicted path ${path}.`);
    }
    try {
      if (!this.resolutionValidated && conflictPaths.includes(SDD_CATALOG_INDEX_PATH)
        && !refreshBranchSyncSddCatalog(this.repositoryRoot)) return invalid('The resolved SDD catalog is invalid.');
      await this.git.execute("git", ["diff", "--check"]);
      // The agent edits files without Git write authority. Only this trusted
      // adapter stages the verified original conflict set, once before checks.
      if (unresolved.length > 0) {
        try { await this.git.stagePaths([...new Set(unresolved)]); }
        catch { return invalid("Trusted staging of the conflict resolution failed."); }
      }
      if ((await this.readPaths(["diff", "--name-only", "--diff-filter=U", "-z"])).length > 0) {
        return invalid("Unresolved merge conflicts remain.");
      }
      if ((await this.readPaths(["diff", "--name-only", "-z"])).length > 0) {
        return invalid("The prepared merge contains unstaged changes.");
      }
      await this.git.execute("git", ["diff", "--cached", "--check"]);
    } catch {
      return invalid("The resolution contains whitespace errors or conflict markers.");
    }
    this.resolutionValidated = true;
    return { valid: true };
  }

  async assertRemoteHeadsUnchanged(
    parentBranch: string,
    parentSha: string,
    workingBranch: string,
    childSha: string,
    token: string,
  ): Promise<BranchSyncResolutionValidation> {
    await this.git.fetch(parentBranch, token);
    if (await this.read("git", ["rev-parse", "FETCH_HEAD"]) !== parentSha) return invalid(`Parent branch ${parentBranch} changed during synchronization.`);
    await this.git.fetch(workingBranch, token);
    if (await this.read("git", ["rev-parse", "FETCH_HEAD"]) !== childSha) return invalid(`Working branch ${workingBranch} changed during synchronization.`);
    return { valid: true };
  }

  async commitAndPush(
    workingBranch: string,
    message: string,
    author: { readonly name: string; readonly email: string },
    token: string,
  ): Promise<string> {
    if (!this.snapshot) throw new Error("No prepared branch synchronization is available.");
    await this.git.configureAuthor(author.name, author.email);
    await this.git.stageAll();
    await this.git.commit(message);
    const sha = await this.read("git", ["rev-parse", "HEAD"]);
    await this.git.push(workingBranch, token);
    this.snapshot = undefined;
    this.mergeInProgress = false;
    return sha;
  }

  async abort(): Promise<void> {
    if (!this.mergeInProgress) return;
    try {
      await this.git.execute("git", ["merge", "--abort"]);
    } finally {
      this.snapshot = undefined;
      this.mergeInProgress = false;
    }
  }

  private async assertValidBranch(branch: string): Promise<void> {
    if (!branch.trim() || branch.startsWith("-")) throw new Error("Invalid branch name.");
    await this.git.execute("git", ["check-ref-format", "--branch", branch]);
  }

  private async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    try {
      return await this.git.execute("git", ["merge-base", "--is-ancestor", ancestor, descendant]) === 0;
    } catch {
      return false;
    }
  }

  private async listWorkspacePaths(): Promise<string[]> {
    return (await inspectWorkspacePaths(this.git)).sort();
  }

  private async readPaths(args: string[]): Promise<string[]> {
    return (await this.readRaw("git", args)).split("\0").filter(Boolean).sort();
  }

  private async readIndexEntries(): Promise<Map<string, string>> {
    const entries = (await this.readRaw("git", ["ls-files", "-s", "-z"])).split("\0").filter(Boolean);
    return new Map(entries.map((entry) => {
      const separator = entry.indexOf("\t");
      return [entry.slice(separator + 1), entry.slice(0, separator)] as const;
    }));
  }

  private async read(program: string, args: string[]): Promise<string> {
    return (await this.readRaw(program, args)).trim();
  }

  private async readRaw(program: string, args: string[]): Promise<string> {
    const chunks: Buffer[] = [];
    await this.git.execute(program, args, { stdout: (data) => chunks.push(data) });
    return Buffer.concat(chunks).toString("utf8");
  }
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function invalid(reason: string): BranchSyncResolutionValidation {
  return { valid: false, reason };
}
