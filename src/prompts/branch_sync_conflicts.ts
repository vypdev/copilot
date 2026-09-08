import { fillTemplate } from "./fill";

export interface BranchSyncConflictsParams extends Record<string, string> {
  owner: string;
  repo: string;
  parentBranch: string;
  workingBranch: string;
  conflictPaths: string;
}

const TEMPLATE = `You are resolving a merge that is already in progress in {{owner}}/{{repo}}.

Parent branch: {{parentBranch}}
Working branch: {{workingBranch}}
Files with merge conflicts:
{{conflictPaths}}

Resolve every existing conflict conservatively, preserving the intent of both branches. You may inspect the repository and edit only the listed conflicted files. Do not run git commit, git push, git checkout, git reset, git rebase, or start another merge. Do not modify workflows, credentials, lockfiles, generated files, or any path outside the conflict list unless that path itself is listed. Remove all conflict markers and stage the resolved files. Run focused checks when useful, then give a concise summary of the decisions you made.`;

export function getBranchSyncConflictsPrompt(
  params: BranchSyncConflictsParams,
): string {
  return fillTemplate(TEMPLATE, params);
}
