import { ApplicationError } from '../../application/errors/application_error';
import type { ProgressDiffEvidence } from '../../application/ports/progress_diff_query_ports';
import type { GithubBranchComparisonClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import { partitionProgressDiff } from '../../application/policies/progress_diff_partition_policy';

const MAX_COMPARISON_FILES = 300;
const STATUSES = new Set(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']);

/** Reads exact GitHub objects, omitting generated bundle patches but retaining their file facts. */
export class ProgressDiffRepository {
    constructor(private readonly client: GithubClientPort<GithubBranchComparisonClient>) {}
    async getDiff(owner: string, repository: string, baseSha: string, headSha: string, token: string): Promise<ProgressDiffEvidence> {
        if (![baseSha, headSha].every(sha => /^[a-f0-9]{40}$/u.test(sha))) throw unavailable('workflow.stale');
        const { data } = await this.client.getClient(token).rest.repos.compareCommits({ owner, repo: repository, base: baseSha, head: headSha, per_page: 1, page: 1 });
        // GitHub supplies at most 300 comparison files. At that boundary, completeness is unknown.
        if (!Array.isArray(data.files) || data.files.length >= MAX_COMPARISON_FILES) throw unavailable();
        const paths = new Set<string>();
        const changes = data.files.map(file => {
            const path = file.filename;
            if (typeof path !== 'string' || !path || path.length > 1024 || path.startsWith('/') || path.includes('\\')
                || path.includes('\0') || path.split('/').includes('..') || paths.has(path) || !STATUSES.has(file.status)
                || ![file.additions, file.deletions].every(value => Number.isSafeInteger(value) && value! >= 0)) throw unavailable();
            paths.add(path);
            const generated = path.startsWith('build/') || path === 'specs/CATALOG.md';
            const unchanged = file.status === 'unchanged' && file.additions === 0 && file.deletions === 0;
            if (!generated && !unchanged && (typeof file.patch !== 'string' || !file.patch)) {
                throw new ApplicationError('validation.evidence-unavailable',
                    'GitHub omitted a required file patch from the pinned comparison. Progress was not assessed and existing state was retained.');
            }
            return { path, status: file.status, additions: file.additions!, deletions: file.deletions!,
                ...(generated ? { evidence: 'generated-metadata-only' as const } : { patch: file.patch ?? '' }) };
        });
        if (baseSha === headSha && changes.length > 0) throw unavailable('workflow.stale');
        return partitionProgressDiff(baseSha, headSha, changes);
    }
}
function unavailable(code: 'workflow.stale' | 'provider.unavailable' = 'provider.unavailable'): ApplicationError {
    return new ApplicationError(code, 'A complete bounded branch comparison is unavailable. Progress was not assessed and existing state was retained.');
}
