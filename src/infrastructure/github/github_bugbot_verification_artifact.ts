import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CopilotVerificationArtifactPort } from '../../application/ports/copilot_evidence_ports';
import {
    BUGBOT_VERIFICATION_ARTIFACT_FILE, bugbotVerificationArtifactName,
    type BugbotVerificationArtifact,
} from '../../domain/bugbot/verification_artifact';

type Upload = (name: string, file: string, directory: string) => Promise<{ id?: number }>;

async function upload(name: string, file: string, directory: string): Promise<{ id?: number }> {
    const { DefaultArtifactClient } = await import('@actions/artifact');
    return new DefaultArtifactClient().uploadArtifact(name, [file], directory);
}

/** The Actions runtime authenticates the immutable artifact to its native run. */
export function createGithubBugbotVerificationArtifacts(uploadArtifact: Upload = upload): CopilotVerificationArtifactPort {
    return {
        async publish(checkRunId, verification) {
            const { runId, attempt, receipt } = verification;
            if (![checkRunId, runId, attempt].every(value => Number.isSafeInteger(value) && value > 0)
                || String(runId) !== process.env.GITHUB_RUN_ID || String(attempt) !== process.env.GITHUB_RUN_ATTEMPT
                || !receipt.startsWith('<!-- copilot-bugbot-verification:v1 ') || Buffer.byteLength(receipt) > 4096) {
                throw new Error('bugbot-verification-artifact-binding');
            }
            const directory = mkdtempSync(join(tmpdir(), 'copilot-bugbot-receipt-'));
            try {
                const file = join(directory, BUGBOT_VERIFICATION_ARTIFACT_FILE);
                const artifact: BugbotVerificationArtifact = { version: 1, runId, attempt, checkRunId, receipt };
                writeFileSync(file, JSON.stringify(artifact), { mode: 0o600, flag: 'wx' });
                const result = await uploadArtifact(bugbotVerificationArtifactName(runId, attempt), file, directory);
                if (!Number.isSafeInteger(result.id) || result.id! <= 0) throw new Error('bugbot-verification-artifact-unavailable');
            } finally {
                rmSync(directory, { recursive: true, force: true });
            }
        },
    };
}
