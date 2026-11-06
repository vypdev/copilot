import type { BugbotPullRequestIdentity } from '../../domain/bugbot/context';
import type { BugbotFramedReviewSource } from '../../domain/bugbot/framed_review';
import type { PullRequestReviewDiffSnapshot } from './bugbot_pull_request_read_ports';

/** Fixed, read-only host capability. No process, filesystem-write or credential authority escapes. */
export interface BugbotReviewSourcePort {
    readCompleteSource(identity: BugbotPullRequestIdentity, snapshot: PullRequestReviewDiffSnapshot,
        enumerationComplete: boolean, ignorePatterns: readonly string[]): Promise<BugbotFramedReviewSource>;
}
