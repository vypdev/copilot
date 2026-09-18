import type { SetupConfiguration } from '../../domain/setup';

export interface ApprovalReadinessFacts {
    readonly defaultBranchWorkflow: 'matching' | 'missing' | 'drift' | 'unavailable';
    readonly rules: readonly { role: 'development' | 'main'; branch: string; readable: boolean; dismissesStaleReviews: boolean; approvalCheckCycle: boolean }[];
    readonly missingWorkflowNames: readonly string[];
}

/** Read-only remote facts; no mutation capability is injected into doctor. */
export interface SetupApprovalReadinessPort {
    inspect(owner: string, repository: string, setupToken: string, configuration: Readonly<SetupConfiguration>): Promise<ApprovalReadinessFacts>;
}
