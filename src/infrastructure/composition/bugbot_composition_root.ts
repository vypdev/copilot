import { createIssueContentClient } from "./github_issue_client_factory";
import { createGraphqlTransportClient } from "./github_project_client_factory";
import {
  createPullRequestChangesClient,
  createPullRequestLifecycleClient,
  createPullRequestReviewCommentClient,
} from "./github_pull_request_client_factory";
import type { BugbotContextPorts } from "../../application/ports/bugbot_context_ports";
import type { BugbotFindingResolutionPorts } from "../../application/ports/bugbot_finding_resolution_ports";
import type { BugbotFindingPublicationPorts } from "../../application/ports/bugbot_finding_publication_ports";

import { BugbotIssueRepository } from "../../data/repository/issue/bugbot_issue_repository";
import { IssueContentRepository } from "../../data/repository/issue/issue_content_repository";
import { BugbotPullRequestRepository } from "../../data/repository/pull_request/bugbot_pull_request_repository";
import { PullRequestChangesRepository } from "../../data/repository/pull_request/pull_request_changes_repository";
import { PullRequestLifecycleRepository } from "../../data/repository/pull_request/pull_request_lifecycle_repository";
import { PullRequestReviewCommentCommandRepository } from "../../data/repository/pull_request/pull_request_review_comment_command_repository";
import { PullRequestReviewCommentQueryRepository } from "../../data/repository/pull_request/pull_request_review_comment_query_repository";
import { PullRequestReviewThreadRepository } from "../../data/repository/pull_request/pull_request_review_thread_repository";
import { WorkspaceBugbotRulesRepository } from '../filesystem/workspace_bugbot_rules_repository';
import { LoggerBugbotTelemetryAdapter } from '../logging/logger_bugbot_telemetry_adapter';
import type { BugbotTelemetryPort } from '../../application/ports/bugbot_telemetry_ports';
import type { BugbotLearnedRuleCommandPort, BugbotRuleFileQueryPort } from '../../application/ports/bugbot_rule_ports';

export type BugbotCompositionRoot = {
  issue: BugbotIssueRepository;
  pullRequest: BugbotPullRequestRepository;
  context: BugbotContextPorts;
  resolution: BugbotFindingResolutionPorts;
  publication: BugbotFindingPublicationPorts;
  telemetry: BugbotTelemetryPort;
  rules: BugbotRuleFileQueryPort & BugbotLearnedRuleCommandPort;

};

export function createBugbotCompositionRoot(): BugbotCompositionRoot {
  const issue = new BugbotIssueRepository(
    new IssueContentRepository(createIssueContentClient()),
  );
  const reviewCommentClient = createPullRequestReviewCommentClient();
  const graphqlClient = createGraphqlTransportClient();
  const reviewQuery = new PullRequestReviewCommentQueryRepository(
    reviewCommentClient,
  );
  const reviewCommand = new PullRequestReviewCommentCommandRepository(
    reviewCommentClient,
    graphqlClient,
    reviewCommentClient,
  );
  const threadCommand = new PullRequestReviewThreadRepository(
    graphqlClient,
  );
  const pullRequest = new BugbotPullRequestRepository(
    new PullRequestLifecycleRepository(createPullRequestLifecycleClient()),
    new PullRequestChangesRepository(createPullRequestChangesClient()),
    reviewQuery,
    reviewCommand,
    threadCommand,
  );
  const rules = new WorkspaceBugbotRulesRepository();
  return {
    issue,
    pullRequest,
    context: { issue, pullRequest, rules },
    resolution: { issueComments: issue, pullRequestComments: pullRequest },
    publication: { issueComments: issue, pullRequestComments: pullRequest },
    telemetry: new LoggerBugbotTelemetryAdapter(),
    rules,

  };
}
