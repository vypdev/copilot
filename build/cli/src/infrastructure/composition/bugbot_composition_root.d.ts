import type { BugbotContextPorts } from "../../application/ports/bugbot_context_ports";
import type { BugbotFindingResolutionPorts } from "../../application/ports/bugbot_finding_resolution_ports";
import type { BugbotFindingPublicationPorts } from "../../application/ports/bugbot_finding_publication_ports";
import { BugbotIssueRepository } from "../../data/repository/issue/bugbot_issue_repository";
import { BugbotPullRequestRepository } from "../../data/repository/pull_request/bugbot_pull_request_repository";
export type BugbotCompositionRoot = {
    issue: BugbotIssueRepository;
    pullRequest: BugbotPullRequestRepository;
    context: BugbotContextPorts;
    resolution: BugbotFindingResolutionPorts;
    publication: BugbotFindingPublicationPorts;
};
export declare function createBugbotCompositionRoot(): BugbotCompositionRoot;
