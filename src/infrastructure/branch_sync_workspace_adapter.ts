import { COMMUNICATION_BUDGET_PATH, refreshBranchSyncCommunicationBudget } from './branch_sync_communication_budget';
import type {
  BranchMergePreparation,
  BranchSyncResolutionValidation,
  BranchSyncWorkspacePort,
} from "../application/ports/branch_sync_ports";
import type { BranchSyncValidationCode } from '../domain/branch_sync_validation';
import { logInfo } from '../application/ports/logging_ports';
import type { GitCommitPort } from "../application/ports/git_ports";
import { listWorkspacePaths as inspectWorkspacePaths } from "../application/usecases/steps/commit/bugbot/workspace_changes";
import { inspectBranchSyncCatalogSource, inspectBranchSyncSddCatalogProfile, refreshBranchSyncSddCatalogDetailed,
  SDD_CATALOG_INDEX_PATH, SDD_CATALOG_PATH } from './branch_sync_sdd_catalog';
import { BRANCH_SYNC_CATALOG_MAX_BYTES, BranchSyncCatalogFailure, catalogDiagnostic,
  type BranchSyncCatalogDiagnostic } from '../domain/branch_sync_catalog_diagnostic';

interface MergeWorkspaceSnapshot {
  readonly parentSha: string;
  readonly childSha: string;
  readonly conflictPaths: readonly string[];
  readonly workspacePaths: readonly string[];
  readonly protectedIndexEntries: ReadonlyMap<string, string>;
}

// ncc output includes vendor/webpack whitespace. Keep conflict-marker checks
// on these exact artifacts; source and every other path retain strict checks.
const GENERATED_BUNDLES = ['build/cli/index.js', 'build/api/index.js', 'build/github_action/index.js'];

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
    if (conflictPaths.includes(SDD_CATALOG_INDEX_PATH)) {
      const diagnostic = inspectBranchSyncSddCatalogProfile(this.repositoryRoot);
      if (diagnostic.phase === 'metadata-conflict-markers' && conflictPaths.includes(SDD_CATALOG_PATH)) {
        // Immutable original objects establish compatibility before a fixer sees
        // conflicted JSON. A clean, reviewed SDK migration uses merged bytes instead.
        await this.assertOriginalCatalogProfile(childSha);
        await this.assertOriginalCatalogProfile(parentSha);
      } else this.assertSdkCatalogProfile(diagnostic);
    }
    if (conflictPaths.length === 0 && workspacePaths.includes(SDD_CATALOG_PATH) && workspacePaths.includes(SDD_CATALOG_INDEX_PATH)) {
      const refreshed = refreshBranchSyncSddCatalogDetailed(this.repositoryRoot);
      if (!refreshed.valid) throw new BranchSyncCatalogFailure(refreshed.diagnostic);
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
    if (!snapshot || !sameSet(snapshot.conflictPaths, conflictPaths)) return invalid("Merge state does not match the expected conflict set.", "merge-state-mismatch");
    if (await this.read("git", ["rev-parse", "HEAD"]) !== snapshot.childSha) return invalid("The agent changed HEAD.", "head-changed");
    if (await this.read("git", ["rev-parse", "MERGE_HEAD"]) !== snapshot.parentSha) return invalid("The agent changed the merge parent.", "merge-parent-changed");
    const unresolved = await this.readPaths(["diff", "--name-only", "--diff-filter=U", "-z"]);
    if (unresolved.some(path => !conflictPaths.includes(path)) || (this.resolutionValidated && unresolved.length > 0)) {
      return invalid("Unresolved merge conflicts remain.", "unresolved-conflicts");
    }
    const currentPaths = await this.listWorkspacePaths();
    if (!sameSet(currentPaths, snapshot.workspacePaths)) {
      reportWorkspacePathRejection(snapshot, currentPaths, this.resolutionValidated ? 'verification' : 'resolution');
      return invalid("The agent changed paths outside the prepared merge.", "unexpected-paths");
    }
    const unstaged = await this.readPaths(["diff", "--name-only", "-z"]);
    if (unstaged.some(path => !conflictPaths.includes(path)) || (this.resolutionValidated && unstaged.length > 0)) {
      return invalid("The prepared merge contains unstaged changes.", "unstaged-changes");
    }

    const indexEntries = await this.readIndexEntries();
    for (const [path, entry] of snapshot.protectedIndexEntries) {
      if (indexEntries.get(path) !== entry) return invalid(`The agent changed non-conflicted path ${path}.`, "protected-index-changed");
    }
    try {
      if (!this.resolutionValidated && conflictPaths.includes(COMMUNICATION_BUDGET_PATH)
        && !refreshBranchSyncCommunicationBudget(this.repositoryRoot)) return invalid('The resolved communication budget is invalid.', 'communication-budget-invalid');
      if (!this.resolutionValidated && conflictPaths.includes(SDD_CATALOG_INDEX_PATH)) {
        const refreshed = refreshBranchSyncSddCatalogDetailed(this.repositoryRoot);
        if (!refreshed.valid) return { ...invalid('The resolved SDD catalog is invalid.', 'sdd-catalog-invalid'),
          catalogDiagnostic: refreshed.diagnostic };
      }
      await this.checkResolvedDiff(false);
      // The agent edits files without Git write authority. Only this trusted
      // adapter stages the verified original conflict set, once before checks.
      if (unresolved.length > 0) {
        try { await this.git.stagePaths([...new Set(unresolved)]); }
        catch { return invalid("Trusted staging of the conflict resolution failed.", "staging-failed"); }
      }
      if ((await this.readPaths(["diff", "--name-only", "--diff-filter=U", "-z"])).length > 0) {
        return invalid("Unresolved merge conflicts remain.", "unresolved-conflicts");
      }
      if ((await this.readPaths(["diff", "--name-only", "-z"])).length > 0) {
        return invalid("The prepared merge contains unstaged changes.", "unstaged-changes");
      }
      await this.checkResolvedDiff(true);
    } catch {
      return invalid("The resolution contains whitespace errors or conflict markers.", "whitespace-or-conflict-markers");
    }
    if (!this.resolutionValidated) {
      // Trusted staging can remove an original conflict from status when its
      // resolution equals the child bytes (or the child's deletion). Freeze
      // that resolved path set before checks; added paths and disappearance of
      // non-conflicted parent changes remain invalid.
      const resolvedPaths = await this.listWorkspacePaths();
      if (resolvedPaths.some(path => !snapshot.workspacePaths.includes(path))
        || snapshot.workspacePaths.some(path => !resolvedPaths.includes(path) && !snapshot.conflictPaths.includes(path))) {
        reportWorkspacePathRejection(snapshot, resolvedPaths, 'trusted-staging');
        return invalid("The agent changed paths outside the prepared merge.", "unexpected-paths");
      }
      this.snapshot = { ...snapshot, workspacePaths: resolvedPaths };
    }
    this.resolutionValidated = true;
    return { valid: true };
  }

  private async checkResolvedDiff(cached: boolean): Promise<void> {
    const diff = ['diff', ...(cached ? ['--cached'] : []), '--check', '--'];
    await this.git.execute('git', [...diff, '.', ...GENERATED_BUNDLES.map(path => `:(exclude)${path}`)]);
    // Git detects conflict markers independently of its whitespace settings.
    await this.git.execute('git', ['-c', 'core.whitespace=-blank-at-eol,-blank-at-eof,-space-before-tab',
      ...diff, ...GENERATED_BUNDLES]);
  }

  async assertRemoteHeadsUnchanged(
    parentBranch: string,
    parentSha: string,
    workingBranch: string,
    childSha: string,
    token: string,
  ): Promise<BranchSyncResolutionValidation> {
    await this.git.fetch(parentBranch, token);
    if (await this.read("git", ["rev-parse", "FETCH_HEAD"]) !== parentSha) return invalid(`Parent branch ${parentBranch} changed during synchronization.`, "parent-head-changed");
    await this.git.fetch(workingBranch, token);
    if (await this.read("git", ["rev-parse", "FETCH_HEAD"]) !== childSha) return invalid(`Working branch ${workingBranch} changed during synchronization.`, "working-head-changed");
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
      try {
        await this.git.execute("git", ["merge", "--abort"]);
      } catch (error) {
        // Verification may change a tracked resolution after trusted staging,
        // preventing Git's normal abort. Restore only our originally clean,
        // still-identical prepared merge; never reset a moved HEAD or parent.
        const snapshot = this.snapshot;
        if (!snapshot || await this.read("git", ["rev-parse", "HEAD"]) !== snapshot.childSha
          || await this.read("git", ["rev-parse", "MERGE_HEAD"]) !== snapshot.parentSha) throw error;
        await this.git.execute("git", ["reset", "--hard", snapshot.childSha]);
      }
      if (this.snapshot && await this.read('git', ['rev-parse', 'HEAD']) !== this.snapshot.childSha) {
        throw new Error('Original branch head restoration could not be verified.');
      }
    } finally {
      this.snapshot = undefined;
      this.mergeInProgress = false;
    }
  }

  private async assertValidBranch(branch: string): Promise<void> {
    if (!branch.trim() || branch.startsWith("-")) throw new Error("Invalid branch name.");
    await this.git.execute("git", ["check-ref-format", "--branch", branch]);
  }

  private assertSdkCatalogProfile(diagnostic: BranchSyncCatalogDiagnostic): void {
    if (diagnostic.profile !== 'sdk-v1' || diagnostic.phase !== 'profile-compatibility') this.rejectCatalogProfile(diagnostic);
  }

  private rejectCatalogProfile(diagnostic: BranchSyncCatalogDiagnostic): never {
    const closed = catalogDiagnostic(diagnostic.phase, diagnostic.profile, diagnostic.field, diagnostic.capabilityNumber);
    logInfo('Branch synchronization catalog compatibility rejected: ' + JSON.stringify(closed));
    throw new BranchSyncCatalogFailure(closed);
  }

  private async assertOriginalCatalogProfile(revision: string): Promise<void> {
    const boundary = catalogDiagnostic('catalog-file-boundary');
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(revision)) this.rejectCatalogProfile(boundary);
    let source: string;
    try {
      const entry = await this.readRaw('git', ['ls-tree', '-z', revision, '--', SDD_CATALOG_PATH]);
      const match = /^(?:100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\tspecs\/catalog\.json\0$/u.exec(entry);
      if (!match) throw new Error('Catalog object boundary.');
      const size = await this.read('git', ['cat-file', '-s', match[1]]);
      if (!/^(?:0|[1-9][0-9]*)$/u.test(size) || Number(size) > BRANCH_SYNC_CATALOG_MAX_BYTES) throw new Error('Catalog object size.');
      source = await this.readRaw('git', ['cat-file', 'blob', match[1]]);
      if (Buffer.byteLength(source, 'utf8') !== Number(size)) throw new Error('Catalog object size changed.');
    } catch { this.rejectCatalogProfile(boundary); }
    this.assertSdkCatalogProfile(inspectBranchSyncCatalogSource(source));
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

/** Counts and fixed phases only; never disclose private workspace path names. */
function reportWorkspacePathRejection(snapshot: MergeWorkspaceSnapshot, current: readonly string[],
  phase: 'resolution' | 'trusted-staging' | 'verification'): void {
  const added = current.filter(path => !snapshot.workspacePaths.includes(path));
  const removed = snapshot.workspacePaths.filter(path => !current.includes(path));
  const conflicts = removed.filter(path => snapshot.conflictPaths.includes(path)).length;
  const bundles = added.filter(path => GENERATED_BUNDLES.includes(path)).length;
  logInfo(`Branch synchronization workspace rejected (${phase}; added=${added.length}; removed-conflicts=${conflicts}; removed-protected=${removed.length - conflicts}; generated-bundles=${bundles}).`);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function invalid(reason: string, code: BranchSyncValidationCode): BranchSyncResolutionValidation {
  return { valid: false, reason, code };
}
