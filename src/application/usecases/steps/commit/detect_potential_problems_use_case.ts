import { isAgentConfigurationReady } from "../../../../data/model/agent";
import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { FindingsQueryPort } from "../../../ports/agent_findings_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { ParamUseCase } from "../../base/param_usecase";
import type { BugbotContextPorts } from "../../../ports/bugbot_context_ports";
import type { BugbotFindingPublicationPorts } from "../../../ports/bugbot_finding_publication_ports";
import type { BugbotFindingResolutionPorts } from "../../../ports/bugbot_finding_resolution_ports";
import { PullRequestReviewOperationError } from "../../../ports/pull_request_review_errors";
import { buildBugbotPrompt } from "./bugbot/build_bugbot_prompt";
import { loadBugbotContext } from "./bugbot/load_bugbot_context_use_case";
import {
  applyDetectedFindings,
  prepareDetectedFindings,
} from "./bugbot/apply_detected_findings";
import { queryBugbotFindings } from "./bugbot/query_bugbot_findings";

export type { BugbotFinding } from "./bugbot/types";

export class DetectPotentialProblemsUseCase implements ParamUseCase<
  Execution,
  Result[]
> {
  taskId = "DetectPotentialProblemsUseCase";

  constructor(
    private readonly aiRepository: FindingsQueryPort,
    private readonly contextPorts: BugbotContextPorts,
    private readonly publicationPorts: BugbotFindingPublicationPorts,
    private readonly resolutionPorts: BugbotFindingResolutionPorts,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    const results: Result[] = [];
    try {
      if (
        !isAgentConfigurationReady(param.ai?.getAgentConfiguration("findings"))
      ) {
        logDebugInfo(
          "Agent not configured; skipping potential problems detection.",
        );
        return results;
      }
      if (param.issueNumber === -1) {
        logDebugInfo(
          "No issue number for this branch; skipping potential problems detection.",
        );
        return results;
      }

      const context = await loadBugbotContext(
        param,
        undefined,
        this.contextPorts,
      );
      const prompt = buildBugbotPrompt(param, context);
      logInfo(
        "Detecting potential problems via configured agent (agent computes changes and checks resolved)...",
      );
      const prepared = prepareDetectedFindings(
        param,
        await queryBugbotFindings(this.aiRepository, param, prompt),
      );
      if (prepared === undefined) {
        logDebugInfo("DetectPotentialProblems: No response from configured agent.");
        results.push(
          new Result({
            id: this.taskId,
            success: false,
            executed: true,
            errors: [new Error("The configured agent returned no potential-problem analysis.")],
          }),
        );
        return results;
      }

      if (
        prepared.toPublish.length === 0 &&
        prepared.resolvedFindingIds.size === 0
      ) {
        results.push(
          new Result({
            id: this.taskId,
            success: true,
            executed: true,
            steps: [
              "Potential problems detection completed (no new findings, no resolved).",
            ],
          }),
        );
        return results;
      }

      const resolutionErrors = await applyDetectedFindings(
        param,
        context,
        prepared,
        this.publicationPorts,
        this.resolutionPorts,
      );
      const stepParts = [
        `${prepared.toPublish.length} new/current finding(s) from configured agent`,
      ];
      if (prepared.overflowCount > 0) {
        stepParts.push(
          `${prepared.overflowCount} more not published (see summary comment)`,
        );
      }
      if (prepared.resolvedFindingIds.size > 0) {
        stepParts.push(
          `${prepared.resolvedFindingIds.size} marked as resolved by configured agent`,
        );
      }
      results.push(
        new Result({
          id: this.taskId,
          success: resolutionErrors.length === 0,
          executed: true,
          steps: [
            `Potential problems detection completed. ${stepParts.join("; ")}.`,
          ],
          errors: resolutionErrors,
        }),
      );
    } catch (error) {
      const normalizedError =
        error instanceof PullRequestReviewOperationError
          ? error
          : new Error("Unable to detect potential problems.");
      const resultError = new Error(
        `Error in ${this.taskId}: ${normalizedError.message}`,
      );
      logError(resultError.message);
      results.push(
        new Result({
          id: this.taskId,
          success: false,
          executed: true,
          errors: [resultError],
        }),
      );
    }
    return results;
  }
}
