import type { BugbotPullRequestWritePort } from "../../../../ports/bugbot_pull_request_write_ports";
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotFinding, BugbotPrContext, ExistingFindingInfo } from "./types";
export interface PullRequestReviewCommentPublisherOptions {
    repository: BugbotPullRequestWritePort;
    execution: Execution;
    openPrNumber: number;
    prContext: BugbotPrContext;
    watermark: string;
}
export declare class PullRequestReviewCommentPublisher {
    private readonly options;
    private readonly commentsToCreate;
    constructor(options: PullRequestReviewCommentPublisherOptions);
    publish(finding: BugbotFinding, existing: ExistingFindingInfo | undefined): Promise<void>;
    flush(): Promise<void>;
}
