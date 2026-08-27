import type { PullRequestReviewerPort } from "../../application/ports/pull_request_reviewer_ports";
import { PullRequestReviewerRepository } from "../../data/repository/pull_request/pull_request_reviewer_repository";
import { createPullRequestReviewerClient } from "./github_pull_request_client_factory";

export function createPullRequestReviewerCompositionRoot(): PullRequestReviewerPort {
  return new PullRequestReviewerRepository(createPullRequestReviewerClient());
}
