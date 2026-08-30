import type { CopilotEvidence, CopilotEvidencePort } from '../../application/ports/copilot_evidence_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import type { GithubChecksClient } from '../../infrastructure/github/ports/github_checks_provider_ports';

/** GitHub adapter for native Check Runs. Failures are surfaced to the caller for safe fallback handling. */
export class CopilotEvidenceRepository implements CopilotEvidencePort {
    constructor(private readonly client: GithubClientPort<GithubChecksClient>) {}

    async publish(evidence: CopilotEvidence, owner: string, repository: string, token: string): Promise<void> {
        await this.client.getClient(token).rest.checks.create({
            owner,
            repo: repository,
            name: evidence.name,
            head_sha: evidence.headSha,
            status: 'completed',
            conclusion: evidence.conclusion,
            output: {
                title: evidence.title,
                summary: evidence.summary,
            },
        });
    }
}
