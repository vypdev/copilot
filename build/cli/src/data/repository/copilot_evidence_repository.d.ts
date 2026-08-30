import type { CopilotEvidence, CopilotEvidencePort } from '../../application/ports/copilot_evidence_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import type { GithubChecksClient } from '../../infrastructure/github/ports/github_checks_provider_ports';
/** GitHub adapter for native Check Runs. Failures are surfaced to the caller for safe fallback handling. */
export declare class CopilotEvidenceRepository implements CopilotEvidencePort {
    private readonly client;
    constructor(client: GithubClientPort<GithubChecksClient>);
    publish(evidence: CopilotEvidence, owner: string, repository: string, token: string): Promise<void>;
}
