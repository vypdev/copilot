import { ApplicationError, toApplicationError } from '../../application/errors/application_error';
import type { ProgressPullRequestSource } from '../../application/ports/progress_comparison_source_ports';
import { isProgressComparisonBranch } from '../../application/policies/progress_comparison_source_policy';
import type { GithubProgressComparisonClient, GithubProgressPullRequest } from '../../infrastructure/github/ports/github_progress_comparison_provider_port';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';

/** Exact native head ownership, bounded at two candidates. No fallback on unavailable authority. */
export class ProgressComparisonSourceRepository {
    constructor(private readonly client: GithubClientPort<GithubProgressComparisonClient>) {}
    async getSource(owner: string, repository: string, branch: string, token: string): Promise<ProgressPullRequestSource> {
        if (!isProgressComparisonBranch(branch)) throw new ApplicationError('configuration.invalid', 'A safe managed head branch is required for progress.');
        try {
            const client = this.client.getClient(token);
            const { data } = await client.rest.pulls.list({ owner, repo: repository, state: 'open', head: `${owner}:${branch}`, per_page: 2, page: 1 });
            if (!Array.isArray(data) || data.length > 2) throw invalid();
            if (data.length === 0) return Object.freeze({ kind: 'none' });
            if (data.length === 2) return Object.freeze({ kind: 'ambiguous' });
            const candidate = data[0];
            if (!sameRepository(candidate, owner, repository) || candidate.head?.ref !== branch
                || candidate.state !== 'open' || !validNumber(candidate.number)) throw invalid();
            const fresh = await client.rest.pulls.get({ owner, repo: repository, pull_number: candidate.number });
            const pull = fresh.data;
            if (!sameRepository(pull, owner, repository) || pull.number !== candidate.number || pull.state !== 'open'
                || pull.head?.ref !== branch || typeof pull.head.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(pull.head.sha)
                || !isProgressComparisonBranch(pull.base?.ref) || pull.base.ref === branch) throw invalid();
            // PR base.sha can be a historical snapshot. The application pins base.ref with its native ref query.
            return Object.freeze({ kind: 'pull-request', number: pull.number!, headSha: pull.head.sha, baseBranch: pull.base.ref });
        } catch (error) {
            throw toApplicationError(error, 'provider.unavailable', 'Native pull request ownership could not be read. Progress was not assessed; previous progress was retained.');
        }
    }
}
function validNumber(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function sameRepository(pull: GithubProgressPullRequest | undefined, owner: string, repository: string): boolean {
    return typeof pull?.head?.repo?.owner?.login === 'string' && pull.head.repo.owner.login.toLowerCase() === owner.toLowerCase()
        && typeof pull.head.repo.name === 'string' && pull.head.repo.name.toLowerCase() === repository.toLowerCase()
        && typeof pull.base?.repo?.owner?.login === 'string' && pull.base.repo.owner.login.toLowerCase() === owner.toLowerCase()
        && typeof pull.base.repo.name === 'string' && pull.base.repo.name.toLowerCase() === repository.toLowerCase();
}
function invalid(): ApplicationError { return new ApplicationError('workflow.stale', 'Native pull request comparison identity is incomplete, foreign or changed. Existing progress was retained.'); }
