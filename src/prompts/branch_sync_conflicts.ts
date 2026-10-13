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

Resolve every existing conflict conservatively, preserving the intent of both branches. You may inspect the repository and edit only the listed conflicted files. Do not run git commit, git push, git checkout, git reset, git rebase, or start another merge. Do not modify workflows, credentials, lockfiles, generated files, or any path outside the conflict list unless that path itself is listed. Remove all conflict markers, but do not stage files or modify the Git index. If specs/CATALOG.md is listed, it is a derived index: preserve the full owning metadata in specs/catalog.json; do not invent path counts or discard either branch's evidence. Trusted Action code regenerates the listed index with its bundled validator before checks and stages only the original conflicted files. If canonical generated bundles are in the conflict list, regenerate them with the existing offline repository build before returning; do not concatenate or hand-edit generated conflict hunks. Inspect the resulting changes and preserve the original conflict-path boundary: do not change or stage a non-listed file. The trusted Action stages your completed resolution before its verification commands; those commands must reproduce the same bundle bytes without any worktree changes. A build changing files outside the admitted conflict list means the resolution is incomplete and must be reported, not silently accepted. Before returning, run existing offline tests for the affected source modules and the repository typecheck when their toolchains are available. Preserve behavior for missing optional adapters and for both issue and pull-request entrypoints. A compilation or test failure means the resolution is incomplete: correct only the listed conflicted files. Do not claim checks passed when tools are unavailable. Then give a concise summary of the decisions and checks you made.`;

export function getBranchSyncConflictsPrompt(
  params: BranchSyncConflictsParams,
): string {
  return fillTemplate(TEMPLATE, params);
}
