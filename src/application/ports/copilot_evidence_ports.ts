export type CopilotEvidenceConclusion = 'success' | 'failure' | 'neutral';

export interface CopilotEvidence {
    readonly name: 'Copilot / Plan' | 'Copilot / Review' | 'Copilot / Verification';
    readonly headSha: string;
    readonly conclusion: CopilotEvidenceConclusion;
    readonly title: string;
    readonly summary: string;
    readonly verification?: {
        readonly runId: number;
        readonly attempt: number;
        readonly receipt: string;
    };
}

export interface CopilotVerificationArtifactPort {
    publish(checkRunId: number, verification: NonNullable<CopilotEvidence['verification']>): Promise<void>;
}

/** Output port for optional native GitHub Check Runs. */
export interface CopilotEvidencePort {
    publish(evidence: CopilotEvidence, owner: string, repository: string, token: string): Promise<void>;
    retireLiveReviews?(owner: string, repository: string, token: string, conclusion?: 'neutral' | 'failure'): Promise<void>;
}

export interface CopilotLiveReviewCheck {
    readonly headSha: string;
    readonly externalId: string;
    readonly title: string;
    readonly summary: string;
    readonly runUrl: string;
}
