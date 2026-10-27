import type { BranchDependency } from "../../../application/ports/branch_sync_ports";
import { Config, requireCurrentConfigurationPayload } from "../../model/config";
import type { GithubBranchSyncIssueNode, GithubBranchSyncPullRequestNode } from "../../../infrastructure/github/ports/github_branch_sync_protocol";

const CONFIGURATION = /<!--\s*copilot-configuration-start\s*\n([\s\S]*?)\n\s*copilot-configuration-end\s*-->/giu;
type ConfiguredDependency = { kind: 'absent' | 'invalid' } | { kind: 'configured'; dependency: BranchDependency };

/** One primary relationship per issue; prose never establishes ownership. */
export function resolveOpenBranchDependencies(
  issues: readonly GithubBranchSyncIssueNode[],
  pullRequests: readonly GithubBranchSyncPullRequestNode[],
  repositoryFullName: string,
): BranchDependency[] {
  const dependencies: BranchDependency[] = [];
  for (const issue of issues) {
    if (!Number.isSafeInteger(issue.number) || issue.number < 1) continue;
    const configured = configuredBranchDependency(issue);
    if (configured.kind === 'configured') { dependencies.push(configured.dependency); continue; }
    if (configured.kind === 'invalid') continue;
    // Incomplete inventories cannot prove that a fallback relationship is unique.
    if (!Array.isArray(issue.linkedBranches?.nodes) || issue.linkedBranches?.pageInfo?.hasNextPage !== false
      || pullRequests.some(pr => sameRepository(pr.headRepository?.nameWithOwner, repositoryFullName)
        && (!Array.isArray(pr.closingIssuesReferences?.nodes) || pr.closingIssuesReferences?.pageInfo?.hasNextPage !== false))) continue;
    const linkedBranches = new Set(issue.linkedBranches.nodes
      .filter(node => sameRepository(node?.ref?.repository?.nameWithOwner, repositoryFullName))
      .map(node => normalizeBranch(node?.ref?.name)));
    const candidates = new Map<string, BranchDependency>();
    for (const pr of pullRequests) {
      if (!sameRepository(pr.headRepository?.nameWithOwner, repositoryFullName)) continue;
      const closesIssue = pr.closingIssuesReferences!.nodes!.some(node =>
        node?.number === issue.number && sameRepository(node.repository?.nameWithOwner, repositoryFullName));
      const parentBranch = normalizeBranch(pr.baseRefName);
      const workingBranch = normalizeBranch(pr.headRefName);
      if ((!closesIssue && !linkedBranches.has(workingBranch)) || !parentBranch || !workingBranch || parentBranch === workingBranch) continue;
      candidates.set(`${parentBranch}:${workingBranch}`, { issueNumber: issue.number, parentBranch, workingBranch });
    }
    if (candidates.size === 1) dependencies.push([...candidates.values()][0]);
  }
  return dependencies;
}

/** Invalid/partial declarations block fallback; a valid unbranched config does not. */
export function configuredBranchDependency(issue: GithubBranchSyncIssueNode): ConfiguredDependency {
  const body = issue.body ?? '';
  const markerText = body.toLowerCase();
  if (!markerText.includes('copilot-configuration-start') && !markerText.includes('copilot-configuration-end')) return { kind: 'absent' };
  const matches = [...body.matchAll(CONFIGURATION)];
  if (matches.length !== 1 || markerText.split('copilot-configuration-start').length !== 2 || markerText.split('copilot-configuration-end').length !== 2) return { kind: 'invalid' };
  try {
    const input = requireCurrentConfigurationPayload(JSON.parse(matches[0][1]));
    const configuration = new Config(input);
    if (input.parentBranch === undefined && input.workingBranch === undefined) return { kind: 'absent' };
    const parentBranch = normalizeBranch(configuration.parentBranch);
    const workingBranch = normalizeBranch(configuration.workingBranch);
    if (!parentBranch || !workingBranch || parentBranch === workingBranch) return { kind: 'invalid' };
    return { kind: 'configured', dependency: { issueNumber: issue.number, parentBranch, workingBranch } };
  } catch { return { kind: 'invalid' }; }
}

export function dependencyFromPullRequest(pr: GithubBranchSyncPullRequestNode, conversationNumber = pr.number): BranchDependency {
  return { issueNumber: conversationNumber, parentBranch: pr.baseRefName, workingBranch: pr.headRefName };
}

function normalizeBranch(value: string | null | undefined): string | undefined {
  const branch = value?.trim().replace(/^refs\/heads\//u, '');
  // Git ref syntax, with a fixed metadata ceiling; never repair an invalid ref into a different branch.
  return branch && branch.length <= 1024
    && !/^(?:[-/.]|@$)|[\p{Cc}\s~^:?*[\\]|\.\.|@\{|\/\/|[/.]$|(?:^|\/)\.|\.lock(?:\/|$)/u.test(branch)
    ? branch : undefined;
}

function sameRepository(actual: string | undefined, expected: string): boolean {
  return actual?.toLowerCase() === expected.toLowerCase();
}
