import { CopilotEvidencePublicationError } from '../../application/ports/copilot_evidence_error';
import { copilotEvidenceProviderFailure } from './github/copilot_evidence_provider_failure';
import type { CopilotEvidence, CopilotEvidencePort, CopilotLiveReviewCheck } from '../../application/ports/copilot_evidence_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import type { GithubChecksClient } from '../../infrastructure/github/ports/github_checks_provider_ports';

/** Native Check Runs with a closed, credential-free failure boundary. */
export class CopilotEvidenceRepository implements CopilotEvidencePort {
    private readonly live = new Map<string, { id: number; externalId: string }>();
    private readonly attempted = new Set<string>();
    private readonly liveScope = (owner: string, repo: string, head: string) => `${owner}/${repo}:${head}`;
    constructor(private readonly client: GithubClientPort<GithubChecksClient>) {}

    async observeReview(check: CopilotLiveReviewCheck, owner: string, repo: string, token: string): Promise<void> {
        const checks = this.client.getClient(token).rest.checks;
        if (!checks.update) return;
        const key = this.liveScope(owner, repo, check.headSha);
        const existing = this.live.get(key);
        const output = { title: check.title, summary: check.summary };
        if (existing !== undefined) {
            if (existing.externalId === check.externalId) await checks.update({ owner, repo, check_run_id: existing.id, output });
            return;
        }
        if (this.attempted.has(check.externalId)) return;
        this.attempted.add(check.externalId);
        const response = await checks.create({ owner, repo, name: 'Copilot / Review', head_sha: check.headSha,
            status: 'in_progress', external_id: check.externalId, details_url: check.runUrl, output });
        if (!Number.isSafeInteger(response?.data?.id) || response.data.id <= 0) throw new CopilotEvidencePublicationError('provider.contract-invalid');
        this.live.set(key, { id: response.data.id, externalId: check.externalId });
    }

    async retireLiveReviews(owner: string, repo: string, token: string): Promise<void> {
        if (!this.live.size) return;
        const checks = this.client.getClient(token).rest.checks;
        for (const [key, check] of this.live) {
            if (!key.startsWith(`${owner}/${repo}:`)) continue;
            await checks.update?.({ owner, repo, check_run_id: check.id, status: 'completed', conclusion: 'neutral' });
            this.live.delete(key);
        }
    }

    async publish(evidence: CopilotEvidence, owner: string, repository: string, token: string): Promise<void> {
        try {
            const checks = this.client.getClient(token).rest.checks;
            const key = this.liveScope(owner, repository, evidence.headSha);
            const existing = evidence.name === 'Copilot / Review' ? this.live.get(key) : undefined;
            if (existing !== undefined && checks.update) {
                await checks.update({ owner, repo: repository, check_run_id: existing.id, status: 'completed',
                    conclusion: evidence.conclusion, output: { title: evidence.title, summary: evidence.summary } });
                this.live.delete(key);
                return;
            }
            const response = await checks.create({
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
