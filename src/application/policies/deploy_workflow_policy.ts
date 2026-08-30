import type { Execution } from "../../data/model/execution";
import { extractChangelogUpToAdditionalContext } from "../../utils/content_utils";

export interface DeployWorkflowPlan {
  kind: "release" | "hotfix";
  branch: string;
  workflow: string;
  version: string;
  title: string;
  changelog: string;
  issue: number;
}

export function resolveDeployWorkflowPlan(param: Execution): DeployWorkflowPlan | undefined {
  if (!param.issue.labeled || param.issue.labelAdded !== param.labels.deploy) return undefined;

  if (param.release.active && param.release.branch !== undefined) {
    return {
      kind: "release",
      branch: param.release.branch,
      workflow: param.workflows.release,
      version: param.release.version ?? "",
      title: sanitizeTitle(param.issue.title),
      changelog: extractChangelogUpToAdditionalContext(param.issue.body, "Changelog"),
      issue: param.issue.number,
    };
  }
  if (param.hotfix.active && param.hotfix.branch !== undefined) {
    return {
      kind: "hotfix",
      branch: param.hotfix.branch,
      workflow: param.workflows.hotfix,
      version: param.hotfix.version ?? "",
      title: sanitizeTitle(param.issue.title),
      changelog: extractChangelogUpToAdditionalContext(param.issue.body, "Hotfix Solution"),
      issue: param.issue.number,
    };
  }
  return undefined;
}

function sanitizeTitle(title: string): string {
  return title
    .replace(/\b\d+(\.\d+){2,}\b/g, "")
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}^$\n]/gu, "")
    .replace(/\u200D/g, "")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[^a-zA-Z0-9 .]/g, "")
    .replace(/^-+|-+$/g, "")
    .replace(/- -/g, "-")
    .trim()
    .replace(/-+/g, "-")
    .trim();
}
