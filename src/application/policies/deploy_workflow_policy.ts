import { issueWorkflowHeading, type IssueWorkflowProfile, type IssueWorkflowKind } from '../../domain/issue_workflow_profile';
import { readIssueWorkflowFields } from '../../domain/issue_workflow_body';
import { extractChangelogUpToAdditionalContext } from "../../utils/content_utils";

export interface DeployWorkflowExecutionContext {
  readonly issueWorkflowProfile?: IssueWorkflowProfile;
  readonly issue: {
    readonly labeled: boolean;
    readonly labelAdded: string;
    readonly number: number;
    readonly title: string;
    readonly body: string;
  };
  readonly deployLabel: string;
  readonly release: { readonly active: boolean; readonly branch?: string; readonly version?: string };
  readonly hotfix: { readonly active: boolean; readonly branch?: string; readonly version?: string };
  readonly workflows: { readonly release: string; readonly hotfix: string };
}

export interface DeployWorkflowPlan {
  kind: "release" | "hotfix";
  branch: string;
  workflow: string;
  version: string;
  title: string;
  changelog: string;
  issue: number;
}

export function resolveDeployWorkflowPlan(param: DeployWorkflowExecutionContext): DeployWorkflowPlan | undefined {
  if (!param.issue.labeled || param.issue.labelAdded !== param.deployLabel) return undefined;

  if (param.release.active && param.release.branch !== undefined) {
    return {
      kind: "release",
      branch: param.release.branch,
      workflow: param.workflows.release,
      version: param.release.version ?? "",
      title: sanitizeTitle(param.issue.title),
      changelog: workflowChangelog(param, 'release', 'Changelog'),
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
      changelog: workflowChangelog(param, 'hotfix', 'Hotfix Solution'),
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

function workflowChangelog(param: DeployWorkflowExecutionContext, kind: IssueWorkflowKind, canonical: string): string {
  if (!param.issueWorkflowProfile) return extractChangelogUpToAdditionalContext(param.issue.body, canonical);
  return readIssueWorkflowFields(param.issue.body, [issueWorkflowHeading(param.issueWorkflowProfile, kind, canonical)])[0].value || 'No changelog provided';
}
