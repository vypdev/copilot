/** Artifact names are scoped to one native workflow attempt. */
export const bugbotVerificationArtifactName = (runId: number, attempt: number): string =>
    `copilot-bugbot-verification-v1-${runId}-${attempt}`;

export const BUGBOT_VERIFICATION_ARTIFACT_FILE = 'copilot-bugbot-verification.json';

export interface BugbotVerificationArtifact {
    readonly version: 1;
    readonly runId: number;
    readonly attempt: number;
    readonly checkRunId: number;
    readonly receipt: string;
}
