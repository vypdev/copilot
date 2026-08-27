import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueAssigneePort } from "../../../../application/ports/issue_management_ports";
import type { OrganizationMembersPort } from "../../../../application/ports/organization_members_ports";
import type { PullRequestReviewerPort } from "../../../../application/ports/pull_request_reviewer_ports";
import { toPullRequestReviewOperationError } from "../../../../application/ports/pull_request_review_errors";
import { logDebugInfo, logError, logInfo } from "../../../../utils/logger";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

function uniqueLogins(logins: string[]): string[] {
  const identities = new Map<string, string>();
  for (const login of logins) {
    const identity = login.toLowerCase();
    if (!identities.has(identity)) identities.set(identity, login);
  }
  return [...identities.values()];
}

export class AssignReviewersToIssueUseCase implements ParamUseCase<
  Execution,
  Result[]
> {
  taskId: string = "AssignReviewersToIssueUseCase";

  constructor(
    private readonly issueRepository: IssueAssigneePort,
    private readonly pullRequestRepository: PullRequestReviewerPort,
    private readonly projectRepository: OrganizationMembersPort,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

    const desiredReviewersCount = param.pullRequest.desiredReviewersCount;
    const number = param.pullRequest.number;

    const result: Result[] = [];

    try {
      logDebugInfo(`#${number} needs ${desiredReviewersCount} reviewers.`);

      if (desiredReviewersCount <= 0) {
        result.push(
          new Result({
            id: this.taskId,
            success: true,
            executed: true,
          }),
        );
        return result;
      }

      const currentReviewers = uniqueLogins(
        await this.pullRequestRepository.getCurrentReviewers(
          param.owner,
          param.repo,
          number,
          param.tokens.token,
        ),
      );

      if (currentReviewers.length >= desiredReviewersCount) {
        /**
         * No more assignees needed
         */
        result.push(
          new Result({
            id: this.taskId,
            success: true,
            executed: true,
          }),
        );
        return result;
      }

      const currentAssignees = uniqueLogins(
        await this.issueRepository.getCurrentAssignees(
          param.owner,
          param.repo,
          number,
          param.tokens.token,
        ),
      );

      const missingReviewers = desiredReviewersCount - currentReviewers.length;
      logDebugInfo(`#${number} needs ${missingReviewers} more reviewers.`);

      const excludeForReview: string[] = [];
      excludeForReview.push(param.pullRequest.creator);
      excludeForReview.push(...currentReviewers);
      excludeForReview.push(...currentAssignees);

      const excludedIdentities = new Set(
        excludeForReview.map((login) => login.toLowerCase()),
      );
      const members = uniqueLogins(
        await this.projectRepository.getRandomMembers(
          param.owner,
          missingReviewers,
          excludeForReview,
          param.tokens.token,
        ),
      )
        .filter((member) => !excludedIdentities.has(member.toLowerCase()))
        .slice(0, missingReviewers);

      if (members.length === 0) {
        result.push(
          new Result({
            id: this.taskId,
            success: false,
            executed: true,
            steps: [
              `Tried to assign members as reviewers to pull request, but no one was found.`,
            ],
          }),
        );
        return result;
      }

      const reviewersAdded =
        await this.pullRequestRepository.addReviewersToPullRequest(
          param.owner,
          param.repo,
          number,
          members,
          param.tokens.token,
        );

      const requestedMemberLogins = new Set(
        members.map((member) => member.toLowerCase()),
      );
      const confirmedReviewerLogins = new Set<string>();
      const confirmedReviewers = reviewersAdded.filter((member) => {
        const normalizedLogin = member.toLowerCase();
        if (
          !requestedMemberLogins.has(normalizedLogin) ||
          confirmedReviewerLogins.has(normalizedLogin)
        ) {
          return false;
        }
        confirmedReviewerLogins.add(normalizedLogin);
        return true;
      });
      if (confirmedReviewers.length === 0) {
        result.push(
          new Result({
            id: this.taskId,
            success: false,
            executed: true,
            steps: [
              `Tried to assign members as reviewers to pull request, but no reviewer request was confirmed.`,
            ],
          }),
        );
        return result;
      }
      for (const member of confirmedReviewers) {
        result.push(
          new Result({
            id: this.taskId,
            success: true,
            executed: true,
            steps: [`@${member} was requested to review the pull request.`],
          }),
        );
      }

      const reviewersStillNeeded = Math.max(
        desiredReviewersCount -
          currentReviewers.length -
          confirmedReviewers.length,
        0,
      );
      if (reviewersStillNeeded > 0) {
        result.push(
          new Result({
            id: this.taskId,
            success: false,
            executed: true,
            steps: [
              `Confirmed ${confirmedReviewers.length} of ${missingReviewers} required reviewer requests; pull request still needs ${reviewersStillNeeded} ${reviewersStillNeeded === 1 ? "reviewer" : "reviewers"}.`,
            ],
          }),
        );
      }

      return result;
    } catch (error) {
      const normalizedError = toPullRequestReviewOperationError(
        error,
        "assign-reviewers",
      );
      logError(normalizedError);
      result.push(
        new Result({
          id: this.taskId,
          success: false,
          executed: true,
          steps: [`Tried to assign reviewers to pull request.`],
          errors: [normalizedError],
        }),
      );
    }
    return result;
  }
}
