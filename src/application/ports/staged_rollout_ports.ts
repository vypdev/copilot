import type { StagedRolloutEvidence } from '../../domain/staged_rollout';

export interface StagedRolloutReviewPort {
    readMergedPullRequest(pullRequestNumber: number): Promise<StagedRolloutEvidence>;
    isMaintainer(login: string): Promise<boolean>;
}
