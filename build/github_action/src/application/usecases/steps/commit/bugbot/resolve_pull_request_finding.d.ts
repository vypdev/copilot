import type { BugbotPullRequestResolutionPort } from "../../../../../application/ports/bugbot_pull_request_resolution_ports";
export interface PullRequestFindingResolution {
    findingId: string;
    commentIdentity: string;
    pullRequestNumber: number;
    owner: string;
    repo: string;
    token: string;
}
export declare function resolvePullRequestFinding(repository: BugbotPullRequestResolutionPort, resolution: PullRequestFindingResolution): Promise<void>;
