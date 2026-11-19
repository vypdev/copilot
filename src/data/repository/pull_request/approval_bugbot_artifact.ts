import { readSingleJsonArtifact } from '../github/read_single_json_artifact';
import { BUGBOT_VERIFICATION_ARTIFACT_FILE, type BugbotVerificationArtifact } from '../../../domain/bugbot/verification_artifact';

export function readApprovalBugbotArtifact(bytes: Uint8Array, runId: number, attempt: number): BugbotVerificationArtifact | undefined {
    const value = readSingleJsonArtifact(bytes, BUGBOT_VERIFICATION_ARTIFACT_FILE);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const fields = ['version', 'runId', 'attempt', 'checkRunId', 'receipt'];
    const artifact = value as Record<string, unknown>;
    const keys = Object.keys(artifact);
    if (keys.length !== fields.length || !fields.every(field => keys.includes(field))
        || artifact.version !== 1 || artifact.runId !== runId || artifact.attempt !== attempt
        || !Number.isSafeInteger(artifact.checkRunId) || Number(artifact.checkRunId) < 1
        || typeof artifact.receipt !== 'string' || Buffer.byteLength(artifact.receipt) > 4096) return undefined;
    return artifact as unknown as BugbotVerificationArtifact;
}
