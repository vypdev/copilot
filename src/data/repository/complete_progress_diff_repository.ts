import { randomUUID } from 'node:crypto';
import type { ProgressDiffEvidence, ProgressDiffChange } from '../../application/ports/progress_diff_query_ports';
import type { GithubBranchComparisonClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubProgressObjectClient } from '../../infrastructure/github/ports/github_progress_object_provider_port';
import { ImmutableProgressContentRepository, safeProgressPath } from './immutable_progress_content_repository';
import { collectImmutableProgressInventory } from './immutable_progress_inventory_repository';
import { progressContentUnits } from '../../application/policies/progress_content_evidence_policy';
import { progressInventoryError } from '../../application/policies/progress_inventory_error_policy';
import { partitionProgressDiff } from '../../application/policies/progress_diff_partition_policy';
import { frameProgressEvidence } from '../../application/policies/progress_evidence_protocol_policy';
import { isProgressGeneratedArtifact } from '../../application/policies/progress_generated_artifact_policy';
import { progressComparisonCapacityContext, withProgressCapacityContext } from '../../application/policies/progress_capacity_context_policy';

type Comparison = Awaited<ReturnType<GithubBranchComparisonClient['rest']['repos']['compareCommits']>>['data'];
const statuses = new Set(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']);

/** Exactly the capped compare prefix selects a new, complete immutable collection attempt. */
export async function completeProgressDiff(client: GithubProgressObjectClient | undefined, initial: Comparison, baseSha: string, headSha: string,
    owner: string, repository: string, recheck: () => Promise<Comparison>): Promise<ProgressDiffEvidence> {
    if (!Array.isArray(initial.files) || initial.files.length !== 300) throw progressInventoryError('prefix', initial.files?.length ?? 0, 300);
    if (initial.files.some(file => !file || typeof file !== 'object' || Array.isArray(file))) throw progressInventoryError('prefix', 300, 0);
    const prefix = Object.freeze(initial.files.map(file => Object.freeze({ filename: file.filename, status: file.status, previous_filename: file.previous_filename, additions: file.additions, deletions: file.deletions })));
    const named = prefix.map(file => file.filename);
    if (initial.base_commit?.sha !== baseSha || !/^[a-f0-9]{40}$/u.test(initial.merge_base_commit?.sha ?? '') || baseSha === headSha) throw progressInventoryError('identity', prefix.length, 0, []);
    if (new Set(named).size !== named.length || prefix.some(file => !safeProgressPath(file.filename) || !statuses.has(file.status)
        || ![file.additions, file.deletions].every(count => Number.isSafeInteger(count) && count! >= 0)
        || (['renamed', 'copied'].includes(file.status) && !safeProgressPath(file.previous_filename)))) throw progressInventoryError('prefix', prefix.length, 0, named.filter(safeProgressPath));
    if (!client) throw progressInventoryError('capability', prefix.length, 0, named);
    const preimage = initial.merge_base_commit!.sha;
    const recovery = new ImmutableProgressContentRepository(client, owner, repository, 'immutable-tree-v1');
    const inventory = await collectImmutableProgressInventory(recovery, preimage, headSha);
    const paths = inventory.map(change => change.path);
    const members = new Set(paths);
    if (named.some(path => !members.has(path))) throw progressInventoryError('prefix', inventory.length, 0, named);
    const units: ProgressDiffChange[] = [];
    for (const [index, file] of inventory.entries()) {
        const change: ProgressDiffChange = { path: file.path, status: file.status, statistics: 'immutable-content-only' };
        if (isProgressGeneratedArtifact(file.path)) {
            recovery.accountFile(paths);
            units.push({ ...change, unitId: `file-${index + 1}-metadata`, evidence: 'generated-metadata-only' });
        } else {
            const content = await recovery.recoverInventory(preimage, file.path, file.before, file.after, [file.path, ...paths.filter(path => path !== file.path)]);
            units.push(...progressContentUnits(change, content, `file-${index + 1}`));
        }
    }
    const current = await recheck();
    if (current.base_commit?.sha !== baseSha || current.merge_base_commit?.sha !== preimage
        || !Array.isArray(current.files) || current.files.length !== 300
        || current.files.some((file, index) => !file || file.filename !== prefix[index].filename || file.status !== prefix[index].status || file.previous_filename !== prefix[index].previous_filename
            || file.additions !== prefix[index].additions || file.deletions !== prefix[index].deletions)) throw progressInventoryError('source-moved', inventory.length, 0, paths);
    return withProgressCapacityContext(() => {
        const plan = partitionProgressDiff(baseSha, headSha, units, 'immutable-tree-v1');
        return frameProgressEvidence(plan, preimage, units, paths, recovery.usage, randomUUID(), 'immutable-tree-v1');
    }, () => progressComparisonCapacityContext({ baseSha, headSha, requiredPaths: paths }));
}
