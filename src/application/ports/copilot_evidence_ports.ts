export type CopilotEvidenceConclusion = 'success' | 'failure' | 'neutral';

export interface CopilotEvidence {
    readonly name: 'Copilot / Plan' | 'Copilot / Review' | 'Copilot / Verification';
    readonly headSha: string;
    readonly conclusion: CopilotEvidenceConclusion;
    readonly title: string;
    readonly summary: string;
}

/** Output port for optional native GitHub Check Runs. */
export interface CopilotEvidencePort {
    publish(evidence: CopilotEvidence, owner: string, repository: string, token: string): Promise<void>;
}
