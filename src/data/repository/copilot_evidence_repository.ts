import { CopilotEvidencePublicationError } from '../../application/ports/copilot_evidence_error';
import { copilotEvidenceProviderFailure } from './github/copilot_evidence_provider_failure';
import type { CopilotEvidence, CopilotEvidencePort } from '../../application/ports/copilot_evidence_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import type { GithubChecksClient } from '../../infrastructure/github/ports/github_checks_provider_ports';

/** Native Check Runs with a closed, credential-free failure boundary. No automatic write retry. */
export class CopilotEvidenceRepository implements CopilotEvidencePort {
    constructor(private readonly client: GithubClientPort<GithubChecksClient>) {}

    async publish(evidence: CopilotEvidence, owner: string, repository: string, token: string): Promise<void> {
        try {
            const response = await this.client.getClient(token).rest.checks.create({
                owner,
                repo: repository,
                name: evidence.name,
                head_sha: evidence.headSha,
                status: 'completed',
                conclusion: evidence.conclusion,
                output: { title: evidence.title, summary: evidence.summary },
            });
            if (!Number.isSafeInteger(response?.data?.id) || response.data.id <= 0) {
                throw new CopilotEvidencePublicationError('provider.contract-invalid');
            }
        } catch (error) {
            throw copilotEvidenceProviderFailure(error, token);
        }
    }
}
