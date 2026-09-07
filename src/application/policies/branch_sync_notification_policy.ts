import type {
  BranchDependency,
  BranchSyncComparison,
  BranchSyncNotificationComment,
} from "../ports/branch_sync_ports";
import { githubUsersMatch } from "../../domain/github_user_policy";

export const BRANCH_SYNC_STALE_MARKER = "<!-- copilot-branch-sync:stale -->";
export const BRANCH_SYNC_ALIGNED_MARKER = "<!-- copilot-branch-sync:aligned -->";
const BRANCH_SYNC_KEY_MARKER = "<!-- copilot-branch-sync-key:";

export function selectBranchDependenciesForPush(
  dependencies: readonly BranchDependency[],
  pushedBranch: string,
): BranchDependency[] {
  const selected = dependencies.filter(
    (dependency) =>
      dependency.parentBranch === pushedBranch ||
      dependency.workingBranch === pushedBranch,
  );
  const unique = new Map<string, BranchDependency>();
  for (const dependency of selected) {
    unique.set(
      `${dependency.issueNumber}:${dependency.parentBranch}:${dependency.workingBranch}`,
      dependency,
    );
  }
  return [...unique.values()];
}

export function findLatestBranchSyncComment(
  comments: readonly BranchSyncNotificationComment[],
  botLogin?: string,
  dependency?: BranchDependency,
): BranchSyncNotificationComment | undefined {
  return [...comments]
    .reverse()
    .find((comment) => isBranchSyncComment(comment.body)
      && matchesDependency(comment.body, dependency)
      && Boolean(botLogin && comment.user?.login && githubUsersMatch(botLogin, comment.user.login)));
}

export function isStaleBranchSyncComment(body: string | null | undefined): boolean {
  return body?.includes(BRANCH_SYNC_STALE_MARKER) === true;
}

export function buildStaleBranchSyncComment(input: {
  owner: string;
  repository: string;
  dependency: BranchDependency;
  comparison: BranchSyncComparison;
}): string {
  const { dependency, comparison } = input;
  const compareUrl = buildCompareUrl(
    input.owner,
    input.repository,
    dependency.parentBranch,
    dependency.workingBranch,
  );
  const divergence = comparison.aheadBy > 0
    ? ` It also contains ${comparison.aheadBy} commit(s) not present in the parent branch.`
    : "";
  return `${BRANCH_SYNC_STALE_MARKER}
${buildDependencyMarker(dependency)}

## ⚠️ Branch synchronization recommended

\`${dependency.workingBranch}\` is ${comparison.behindBy} commit(s) behind its parent branch \`${dependency.parentBranch}\`.${divergence}

Run \`/copilot sync-branch\` in this conversation to merge the parent changes safely. If Git reports conflicts, the configured fixer agent can resolve eligible files before the verification commands run.

[Compare parent and working branch](${compareUrl})`;
}

export function buildAlignedBranchSyncComment(
  dependency: BranchDependency,
): string {
  return `${BRANCH_SYNC_ALIGNED_MARKER}
${buildDependencyMarker(dependency)}

## ✅ Branch synchronized

\`${dependency.workingBranch}\` now contains the current history of its parent branch \`${dependency.parentBranch}\`.

The previous synchronization recommendation has been resolved.`;
}

function isBranchSyncComment(body: string | null): boolean {
  return body?.includes(BRANCH_SYNC_STALE_MARKER) === true
    || body?.includes(BRANCH_SYNC_ALIGNED_MARKER) === true;
}

function buildDependencyMarker(dependency: BranchDependency): string {
  return `${BRANCH_SYNC_KEY_MARKER}${encodeURIComponent(dependency.parentBranch)}:${encodeURIComponent(dependency.workingBranch)} -->`;
}

function matchesDependency(
  body: string | null,
  dependency: BranchDependency | undefined,
): boolean {
  if (!dependency || !body?.includes(BRANCH_SYNC_KEY_MARKER)) return true;
  return body.includes(buildDependencyMarker(dependency));
}

function buildCompareUrl(
  owner: string,
  repository: string,
  parentBranch: string,
  workingBranch: string,
): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/compare/${encodeURIComponent(parentBranch)}...${encodeURIComponent(workingBranch)}`;
}
