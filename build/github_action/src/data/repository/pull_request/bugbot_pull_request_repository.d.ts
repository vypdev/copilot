import type { BugbotPullRequestWritePort } from "../../../application/ports/bugbot_pull_request_write_ports";
import type { BugbotPullRequestResolutionPort } from "../../../application/ports/bugbot_pull_request_resolution_ports";
import type { BugbotPullRequestReadPort } from "../../../application/ports/bugbot_pull_request_read_ports";
import type { PullRequestReviewComment, PullRequestReviewCommentCommandPort, PullRequestReviewCommentQueryPort, PullRequestReviewThreadCommandPort } from "../../../application/ports/pull_request_review_comment_ports";
import type { PullRequestChangesRepository } from "./pull_request_changes_repository";
import type { PullRequestLifecycleRepository } from "./pull_request_lifecycle_repository";
export declare class BugbotPullRequestRepository implements BugbotPullRequestReadPort, BugbotPullRequestWritePort, BugbotPullRequestResolutionPort {
    private readonly lifecycle;
    private readonly changes;
    private readonly reviewQuery;
    private readonly reviewCommand;
    private readonly threadCommand;
    constructor(lifecycle: PullRequestLifecycleRepository, changes: PullRequestChangesRepository, reviewQuery: PullRequestReviewCommentQueryPort, reviewCommand: PullRequestReviewCommentCommandPort, threadCommand: PullRequestReviewThreadCommandPort);
    getHeadBranchForIssue: (...args: Parameters<BugbotPullRequestReadPort["getHeadBranchForIssue"]>) => Promise<string | undefined>;
    getOpenPullRequestNumbersByHeadBranch: (...args: Parameters<BugbotPullRequestReadPort["getOpenPullRequestNumbersByHeadBranch"]>) => Promise<number[]>;
    getPullRequestReviewCommentBody: (...args: Parameters<BugbotPullRequestReadPort["getPullRequestReviewCommentBody"]>) => Promise<string | null>;
    listPullRequestReviewComments: (...args: Parameters<BugbotPullRequestReadPort["listPullRequestReviewComments"]>) => Promise<PullRequestReviewComment[]>;
    getPullRequestHeadSha: (...args: Parameters<BugbotPullRequestReadPort["getPullRequestHeadSha"]>) => Promise<string | undefined>;
    getChangedFiles: (...args: Parameters<BugbotPullRequestReadPort["getChangedFiles"]>) => Promise<{
        filename: string;
        status: string;
    }[]>;
    getFilesWithFirstDiffLine: (...args: Parameters<BugbotPullRequestReadPort["getFilesWithFirstDiffLine"]>) => Promise<{
        path: string;
        firstLine: number;
    }[]>;
    createReviewWithComments: (...args: Parameters<BugbotPullRequestWritePort["createReviewWithComments"]>) => Promise<void>;
    updatePullRequestReviewComment: (...args: Parameters<BugbotPullRequestWritePort["updatePullRequestReviewComment"]>) => Promise<void>;
    resolvePullRequestReviewThread: (...args: Parameters<BugbotPullRequestResolutionPort["resolvePullRequestReviewThread"]>) => Promise<void>;
}
