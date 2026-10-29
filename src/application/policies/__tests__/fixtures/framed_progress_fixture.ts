import type { ProgressDiffChange, ProgressDiffEvidence } from '../../../ports/progress_diff_query_ports';
import { partitionProgressDiff, serializeProgressDiff } from '../../progress_diff_partition_policy';
import { frameProgressEvidence, bindProgressEvidence } from '../../progress_evidence_protocol_policy';
import { initialProgressRecoveryUsage } from '../../progress_recovery_capacity_policy';

export type Multipart = Extract<ProgressDiffEvidence, { kind: 'partitioned' }>;
export const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), PREIMAGE = 'c'.repeat(40);
export const ATTEMPT = '11111111-1111-4111-8111-111111111111';
export const changes: readonly ProgressDiffChange[] = [
    { path: 'specs/a.md', unitId: 'file-0', status: 'added', additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+# A' },
    { path: 'specs/b.md', unitId: 'file-1', status: 'added', additions: 1, deletions: 0,
        recoveredContent: { side: 'head', text: '# B', sha: HEAD, start: 0, end: 3 } },
];
export function plan(): Multipart {
    const result = partitionProgressDiff(BASE, HEAD, changes);
    if (result.kind !== 'partitioned') throw Error('Expected unit plan');
    return { ...result, partitions: changes.map(change => ({
        id: change.unitId!, paths: [change.path], units: [{ id: change.unitId!, path: change.path,
            ...(change.recoveredContent ? { content: { side: 'head', sha: HEAD, start: 0, end: 3 } } : {}) }],
        evidence: serializeProgressDiff(BASE, HEAD, [change]),
    })) };
}
export function framed(): Multipart {
    return frameProgressEvidence(plan(), PREIMAGE, changes, changes.map(change => change.path), initialProgressRecoveryUsage(), ATTEMPT);
}
export function bound(): Multipart {
    return bindProgressEvidence(framed(), 'Complete both specifications.', '{"requirements":["R1"]}', 'en-US') as Multipart;
}
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
