import type { IssueLabelsPort } from '../../../application/ports/issue_management_ports';
import type { PullRequestBranchQueryPort } from '../../../application/ports/pull_request_branch_ports';
export declare function syncProgressLabelsToOpenPullRequests(owner: string, repo: string, branch: string, progress: number, token: string, issueRepository: IssueLabelsPort, pullRequestRepository: PullRequestBranchQueryPort): Promise<void>;
