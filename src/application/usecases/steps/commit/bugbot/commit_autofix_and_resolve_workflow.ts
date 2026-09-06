import { logInfo } from "../../../../ports/logging_ports";
import { runBugbotAutofixCommitAndPush } from "./bugbot_autofix_commit";

import { getBugbotFixIntentPayload } from "./bugbot_fix_intent_payload";
import type { Result } from "../../../../../data/model/result";
import type { Execution } from "../../../../../data/model/execution";
import type { AuthenticatedUserPort } from "../../../../../application/ports/authenticated_user_ports";
import type { GitCommitPort } from "../../../../../application/ports/git_ports";
import { sanitizePublishedError } from "../../../../../application/policies/github_comment_publication_policy";

export async function commitAutofixAndResolveFindings(
  param: Execution,
  payload: NonNullable<ReturnType<typeof getBugbotFixIntentPayload>>,
  autofixResults: Result[],
  authenticatedUserPort: AuthenticatedUserPort,
  gitCommitPort: GitCommitPort,
): Promise<Error[]> {
  const lastAutofix = autofixResults.at(-1);
  if (!lastAutofix?.success) {
    logInfo("Bugbot autofix did not succeed; skipping commit.");
    return [];
  }
  logInfo("Bugbot autofix succeeded; running commit and push.");
  const autofixPayload = lastAutofix.payload as
    | { workspacePaths?: string[]; branchCheckedOut?: boolean }
    | undefined;
  const commitResult = await runBugbotAutofixCommitAndPush(
    param,
    {
      branchOverride: payload.branchOverride,
      branchAlreadyCheckedOut: autofixPayload?.branchCheckedOut,
      targetFindingIds: payload.targetFindingIds,
      workspacePaths: autofixPayload?.workspacePaths,
    },
    authenticatedUserPort,
    gitCommitPort,
  );
  if (!commitResult.success) {
    const message = sanitizePublishedError(commitResult.error) || 'Commit or push failed after autofix.';
    logInfo(`Bugbot autofix commit failed: ${message}`);
    return [new Error(message)];
  }
  if (commitResult.committed && payload.context) {
    logInfo(
      `Committed autofix for ${payload.targetFindingIds.length} finding(s). `
      + 'Findings remain open until a fresh review verifies the pushed revision.',
    );
    return [];
  } else if (!commitResult.committed) {
    logInfo("No commit performed (no changes or error).");
  }
  return [];
}
