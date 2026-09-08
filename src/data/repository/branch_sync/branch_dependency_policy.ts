import type { BranchDependency } from "../../../application/ports/branch_sync_ports";
import { Config } from "../../model/config";
import type {
  GithubBranchSyncIssueNode,
  GithubBranchSyncPullRequestNode,
} from "../../../infrastructure/github/ports/github_branch_sync_protocol";

const CONFIGURATION = /<!--\s*copilot-configuration-start\s*\n([\s\S]*?)\n\s*copilot-configuration-end\s*-->/iu;

export function resolveOpenBranchDependencies(
  issues: readonly GithubBranchSyncIssueNode[],
  pullRequests: readonly GithubBranchSyncPullRequestNode[],
): BranchDependency[] {
  const candidates: BranchDependency[] = [];
  for (const issue of issues) {
    const configured = dependencyFromConfiguration(issue);
    if (configured) candidates.push(configured);

    const linkedBranches = new Set(
      (issue.linkedBranches?.nodes ?? [])
        .map((node) => normalizeBranch(node?.ref?.name))
        .filter((branch): branch is string => Boolean(branch)),
    );
    for (const pullRequest of pullRequests) {
      if (linkedBranches.has(pullRequest.headRefName) || pullRequestReferencesIssue(pullRequest, issue.number)) {
        candidates.push({
          issueNumber: issue.number,
          parentBranch: pullRequest.baseRefName,
          workingBranch: pullRequest.headRefName,
        });
      }
    }
  }
  return uniqueValidDependencies(candidates);
}

export function dependencyFromPullRequest(
  pullRequest: GithubBranchSyncPullRequestNode,
  conversationNumber = pullRequest.number,
): BranchDependency {
  return {
    issueNumber: conversationNumber,
    parentBranch: pullRequest.baseRefName,
    workingBranch: pullRequest.headRefName,
  };
}

function dependencyFromConfiguration(
  issue: GithubBranchSyncIssueNode,
): BranchDependency | undefined {
  const serialized = issue.body?.match(CONFIGURATION)?.[1];
  if (!serialized) return undefined;
  try {
    const configuration = new Config(JSON.parse(serialized));
    if (!configuration.parentBranch || !configuration.workingBranch) return undefined;
    return {
      issueNumber: issue.number,
      parentBranch: configuration.parentBranch,
      workingBranch: configuration.workingBranch,
    };
  } catch {
    return undefined;
  }
}

function pullRequestReferencesIssue(
  pullRequest: GithubBranchSyncPullRequestNode,
  issueNumber: number,
): boolean {
  if ((pullRequest.closingIssuesReferences?.nodes ?? []).some((issue) => issue?.number === issueNumber)) {
    return true;
  }
  const escaped = String(issueNumber).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^\\w])#${escaped}(?!\\d)`, "u").test(pullRequest.body ?? "");
}

function normalizeBranch(branch: string | null | undefined): string | undefined {
  const normalized = branch?.replace(/^refs\/heads\//u, "").replace(/^\/+/, "").trim();
  return normalized || undefined;
}

function uniqueValidDependencies(candidates: readonly BranchDependency[]): BranchDependency[] {
  const unique = new Map<string, BranchDependency>();
  for (const candidate of candidates) {
    const parentBranch = normalizeBranch(candidate.parentBranch);
    const workingBranch = normalizeBranch(candidate.workingBranch);
    if (!parentBranch || !workingBranch || parentBranch === workingBranch || candidate.issueNumber < 1) continue;
    const dependency = { ...candidate, parentBranch, workingBranch };
    unique.set(`${candidate.issueNumber}:${parentBranch}:${workingBranch}`, dependency);
  }
  return [...unique.values()];
}
