import { logInfo } from "../../../../ports/logging_ports";
import { runBugbotAutofixCommitAndPush } from "./bugbot_autofix_commit";
import { markFindingsResolved } from "./mark_findings_resolved_use_case";

import { getBugbotFixIntentPayload } from "./bugbot_fix_intent_payload";
import type { Result } from "../../../../../data/model/result";
import type { Execution } from "../../../../../data/model/execution";
import type { AuthenticatedUserPort } from "../../../../../application/ports/authenticated_user_ports";
import type { BugbotFindingResolutionPorts } from "../../../../../application/ports/bugbot_finding_resolution_ports";
import type { GitCommitPort } from "../../../../../application/ports/git_ports";

export async function commitAutofixAndResolveFindings(
  param: Execution,
  payload: NonNullable<ReturnType<typeof getBugbotFixIntentPayload>>,
  autofixResults: Result[],
  authenticatedUserPort: AuthenticatedUserPort,
  bugbotResolutionPorts: BugbotFindingResolutionPorts,
  gitCommitPort: GitCommitPort,
): Promise<Error[]> {
  const lastAutofix = autofixResults.at(-1);
  if (!lastAutofix?.success) {
    logInfo("Bugbot autofix did not succeed; skipping commit.");
    return [];
  }
  logInfo("Bugbot autofix succeeded; running commit and push.");
  const autofixPayload = lastAutofix.payload as
    | { workspacePaths?: string[] }
    | undefined;
  const commitResult = await runBugbotAutofixCommitAndPush(
    param,
    {
      branchOverride: payload.branchOverride,
      targetFindingIds: payload.targetFindingIds,
      workspacePaths: autofixPayload?.workspacePaths,
    },
    authenticatedUserPort,
    gitCommitPort,
  );
  if (commitResult.committed && payload.context) {
    const ids = payload.targetFindingIds;
    const resolutionErrors = await markFindingsResolved({
      execution: param,
      context: payload.context,
      resolvedFindingIds: new Set(ids),
      ports: bugbotResolutionPorts,
    });
    if (resolutionErrors.length === 0) {
      logInfo(`Marked ${ids.length} finding(s) as resolved.`);
    }
    return resolutionErrors;
  } else if (!commitResult.committed) {
    logInfo("No commit performed (no changes or error).");
  }
  return [];
}
