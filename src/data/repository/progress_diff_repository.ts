import { ApplicationError } from '../../application/errors/application_error';
import type { ProgressDiffEvidence } from '../../application/ports/progress_diff_query_ports';
import type { GithubBranchComparisonClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import { isCompleteProgressPatch } from '../../application/policies/progress_patch_completeness_policy';
import { ImmutableProgressContentRepository, safeProgressPath } from './immutable_progress_content_repository';
import type { GithubProgressObjectClient } from '../../infrastructure/github/ports/github_progress_object_provider_port';
import { progressContentUnits, progressRecoveryError } from '../../application/policies/progress_content_evidence_policy';
import { PROGRESS_RECOVERY_TOTAL_LIMITS } from '../../application/policies/progress_recovery_capacity_policy';
import { frameProgressEvidence } from '../../application/policies/progress_evidence_protocol_policy';
import { randomUUID } from 'node:crypto';
import { partitionProgressDiff, serializeProgressDiff, MAX_PROGRESS_EVIDENCE_BYTES, type ProgressDiffChange } from '../../application/policies/progress_diff_partition_policy';

const MAX_COMPARISON_FILES = 300;
const STATUSES = new Set(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']);

/** Reads exact GitHub objects, omitting generated bundle patches but retaining their file facts. */
export class ProgressDiffRepository {
    constructor(private readonly client: GithubClientPort<GithubBranchComparisonClient>, private readonly objects?: GithubClientPort<GithubProgressObjectClient>) {}
    async getDiff(owner: string, repository: string, baseSha: string, headSha: string, token: string): Promise<ProgressDiffEvidence> {
        if (![baseSha, headSha].every(sha => /^[a-f0-9]{40}$/u.test(sha))) throw unavailable('workflow.stale');
        const { data } = await this.client.getClient(token).rest.repos.compareCommits({ owner, repo: repository, base: baseSha, head: headSha, per_page: 1, page: 1 });
        // GitHub supplies at most 300 comparison files. At that boundary, completeness is unknown.
        if (!Array.isArray(data.files) || data.files.length >= MAX_COMPARISON_FILES) throw unavailable();
        const paths = new Set<string>();
        const changes = data.files.map(file => {
            const path = file.filename;
            if (!safeProgressPath(path) || paths.has(path) || !STATUSES.has(file.status)
                || ![file.additions, file.deletions].every(value => Number.isSafeInteger(value) && value! >= 0)) throw unavailable();
            paths.add(path);
            const generated = path.startsWith('build/') || path === 'specs/CATALOG.md';
            const unchanged = file.status === 'unchanged' && file.additions === 0 && file.deletions === 0;
            const complete = generated || unchanged || (isCompleteProgressPatch(file.patch, file.additions!, file.deletions!)
                && Buffer.byteLength(serializeProgressDiff(baseSha, headSha, [{ path, status: file.status, additions: file.additions!, deletions: file.deletions!, patch: file.patch }]), 'utf8') <= MAX_PROGRESS_EVIDENCE_BYTES);
            return { change: { path, status: file.status, additions: file.additions!, deletions: file.deletions!,
                ...(generated ? { evidence: 'generated-metadata-only' as const } : complete ? { patch: file.patch ?? '' } : {}) },
                recover: !complete, previousPath: file.previous_filename };
        });
        if (data.base_commit?.sha !== baseSha || !/^[a-f0-9]{40}$/u.test(data.merge_base_commit?.sha ?? '')) {
            throw progressRecoveryError('the comparison preimage could not be pinned', changes.map(file => file.change.path));
        }
        if (baseSha === headSha && changes.length > 0) throw unavailable('workflow.stale');
        const missing = changes.filter(file => file.recover);
        if (missing.length === 0) {
            const complete = changes.map(file => file.change);
            const plan = partitionProgressDiff(baseSha, headSha, complete, 'framed-v1');
            return plan.kind === 'single' ? plan : frameProgressEvidence(plan, data.merge_base_commit!.sha, complete, complete.map(file => file.path), undefined, randomUUID());
        }
        const unreviewed = changes.map(file => file.change.path);
        if (missing.length > PROGRESS_RECOVERY_TOTAL_LIMITS.files) throw progressRecoveryError(`file recovery budget exhausted (requested ${missing.length}, supported total ${PROGRESS_RECOVERY_TOTAL_LIMITS.files})`, unreviewed, true);
        if (!this.objects) throw progressRecoveryError('immutable content recovery is unavailable', unreviewed);
        const recovery = new ImmutableProgressContentRepository(this.objects.getClient(token), owner, repository, 'framed-v1');
        const complete: ProgressDiffChange[] = [];
        for (const [index, file] of changes.entries()) {
            if (!file.recover) { complete.push({ ...file.change, unitId: `file-${index + 1}-patch` }); continue; }
            const content = await recovery.recover(data.merge_base_commit!.sha, headSha, file.change.path, file.change.status, file.previousPath, [file.change.path, ...unreviewed.filter(path => path !== file.change.path)]);
            complete.push(...progressContentUnits(file.change, content, `file-${index + 1}`));
        }
        try {
            const plan = partitionProgressDiff(baseSha, headSha, complete, 'framed-v1');
            return plan.kind === 'single' ? plan : frameProgressEvidence(plan, data.merge_base_commit!.sha, complete, unreviewed, recovery.usage, randomUUID());
        }
        catch (error) {
            if (error instanceof ApplicationError && error.code === 'validation.evidence-too-large') throw progressRecoveryError('complete content exceeds the bounded multipart analysis budget', unreviewed, true);
            throw error;
        }
    }
}
function unavailable(code: 'workflow.stale' | 'provider.unavailable' = 'provider.unavailable'): ApplicationError {
    return new ApplicationError(code, 'A complete bounded branch comparison is unavailable. Progress was not assessed and existing state was retained.');
}
