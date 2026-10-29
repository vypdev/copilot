import type { ProgressDiffEvidence, ProgressDiffPartition } from '../ports/progress_diff_query_ports';
import { aggregateProgressFacts, parseProgressPartitionFacts, progressPartitionFactLimit, MAX_PROGRESS_AGGREGATE_BYTES, type ProgressFileFacts } from './progress_partition_response_policy';
import { progressEvidenceTooLarge } from './progress_diff_partition_policy';
import { progressProtocolRejected, validateFramedProgressEvidence } from './progress_evidence_protocol_policy';

type Partitioned = Extract<ProgressDiffEvidence, { kind: 'partitioned' }>;
export interface ProgressPartitionReceipt {
    readonly requestId: string;
    readonly files: readonly ProgressFileFacts[];
}

/** Retains the actual returned identity, after exact assignment validation. */
export function parseProgressPartitionReceipt(response: unknown, part: ProgressDiffPartition, locale: string, limit: number): ProgressPartitionReceipt {
    const files = parseProgressPartitionFacts(response, part, locale, limit);
    return Object.freeze({ requestId: (response as { partitionId: string }).partitionId, files });
}

function prefix(diff: Partitioned): string {
    return JSON.stringify({ kind: 'complete-framed-partition-analysis', protocol: diff.protocol,
        sources: diff.partitions.map(part => ({ requestId: part.id, sourceIdentity: part.sourceIdentity })) }).slice(0, -1) + ',"analysis":';
}

/** Reserve the complete receipt envelope before allowing any model request. */
export function framedProgressFactBudget(diff: Partitioned, budget: number): number {
    validateFramedProgressEvidence(diff, true);
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > MAX_PROGRESS_AGGREGATE_BYTES) throw progressEvidenceTooLarge();
    const remaining = budget - Buffer.byteLength(prefix(diff)) - 1;
    if (remaining < 1) throw progressEvidenceTooLarge();
    return remaining;
}
export function framedProgressFactLimit(diff: Partitioned, budget: number): number {
    return progressPartitionFactLimit(diff.baseSha, diff.headSha, diff.partitions, framedProgressFactBudget(diff, budget));
}

/** A complete exact-once receipt set is required again at the final boundary. */
export function aggregateProgressReceipts(diff: Partitioned, receipts: readonly ProgressPartitionReceipt[], budget: number): string {
    const factBudget = framedProgressFactBudget(diff, budget);
    if (receipts.length !== diff.partitions.length) throw progressProtocolRejected('response-inventory');
    for (const [index, part] of diff.partitions.entries()) {
        if (!receipts[index] || receipts[index].requestId !== part.id) throw progressProtocolRejected('response-identity');
    }
    const analysis = aggregateProgressFacts(diff.baseSha, diff.headSha, diff.partitions, receipts.map(receipt => receipt.files), factBudget);
    return prefix(diff) + analysis + '}';
}
