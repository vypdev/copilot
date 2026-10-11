import { ApplicationError } from '../../application/errors/application_error';
import type { ProgressDiffEvidence } from '../../application/ports/progress_diff_query_ports';
import type { GithubBranchComparisonClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';

const MAX_COMPARISON_FILES = 300;
const MAX_EVIDENCE_BYTES = 256_000;
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
            if (!generated && (file.additions! > 0 || file.deletions! > 0) && (typeof file.patch !== 'string' || !file.patch)) throw unavailable();
            return { path, status: file.status, additions: file.additions!, deletions: file.deletions!,
                ...(generated ? { evidence: 'generated-metadata-only' } : { patch: file.patch ?? '' }) };
        });
        const evidence = JSON.stringify({ kind: 'pinned-branch-comparison', baseSha, headSha, changes });
        if (Buffer.byteLength(evidence, 'utf8') > MAX_EVIDENCE_BYTES) throw unavailable();
        if (baseSha === headSha && changes.length > 0) throw unavailable('workflow.stale');
        return Object.freeze({ baseSha, headSha, evidence });
    }
}
function unavailable(code: 'workflow.stale' | 'provider.unavailable' = 'provider.unavailable'): ApplicationError {
    return new ApplicationError(code, 'A complete bounded branch comparison is unavailable. Progress was not assessed and existing state was retained.');
}
