import { createIssueContentClient } from "./github_issue_client_factory";
import { createGraphqlTransportClient } from "./github_project_client_factory";
import {
  createPullRequestChangesClient,
  createPullRequestLifecycleClient,
  createPullRequestReviewCommentClient,
} from "./github_pull_request_client_factory";
import type { BugbotScmPorts } from '../../application/ports/bugbot_scm_ports';

import { BugbotIssueRepository } from "../../data/repository/issue/bugbot_issue_repository";
import { IssueContentRepository } from "../../data/repository/issue/issue_content_repository";
import { BugbotIssueCommentQueryRepository } from '../../data/repository/issue/bugbot_issue_comment_query_repository';
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
import { GithubBugbotReviewNavigationAdapter } from '../github/github_bugbot_review_navigation_adapter';
import { BugbotScmPortFactory, type BugbotScmBinding } from './bugbot_scm_port_factory';

export type BugbotCompositionRoot = {
  issue: BugbotIssueRepository;
  scm: BugbotScmPorts;
  telemetry: BugbotTelemetryPort;
  rules: BugbotRuleFileQueryPort & BugbotLearnedRuleCommandPort;

};

export function createBugbotCompositionRoot(binding: BugbotScmBinding): BugbotCompositionRoot {
  const issueContent = new IssueContentRepository(createIssueContentClient());
  const issue = new BugbotIssueRepository(issueContent);
  const reviewCommentClient = createPullRequestReviewCommentClient();
  const graphqlClient = createGraphqlTransportClient();
  const bugbotIssueComments = new BugbotIssueCommentQueryRepository(graphqlClient);
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
  const lifecycle = new PullRequestLifecycleRepository(createPullRequestLifecycleClient());
  const changes = new PullRequestChangesRepository(createPullRequestChangesClient());
  const pullRequest = new BugbotPullRequestRepository(
    changes,
    reviewQuery,
    reviewCommand,
    threadCommand,
  );
  const rules = new WorkspaceBugbotRulesRepository();
  const navigation = new GithubBugbotReviewNavigationAdapter();
  const scm = new BugbotScmPortFactory(
    bugbotIssueComments,
    issue,
    lifecycle,
    changes,
    pullRequest,
    reviewQuery,
    threadCommand,
    rules,
    navigation,
  ).bind(binding);
  return {
    issue,
    scm,
    telemetry: new LoggerBugbotTelemetryAdapter(),
    rules,
  };
}
