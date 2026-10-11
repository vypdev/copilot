import type { PublicationTarget } from '../../domain/github_publication';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import { isHistoryCommand, OPERATION_OUTCOMES } from '../../domain/copilot_operation';
import type { HistoryProjection } from './copilot_history_presentation_policy';
import type { HistoryRow } from './copilot_history_policy';

/** Typed publisher boundary rejects malformed result data rather than trusting a kind string. */
export function readHistoryProjection(value: unknown, bound: PublicationTarget): HistoryProjection | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const data = value as Record<string, unknown>;
    const target = data.target as Record<string, unknown> | undefined;
    if (data.kind !== 'history-command' || !['complete', 'partial', 'unavailable'].includes(String(data.state))
        || typeof data.owner !== 'string' || typeof data.repository !== 'string' || typeof data.serverOrigin !== 'string'
        || !target || Object.keys(target).some(key => !['kind', 'number'].includes(key)) || target.number !== bound.number || target.kind !== (bound.kind === 'pull-request' ? 'pr' : 'issue')
        || !Array.isArray(data.rows) || data.rows.length > 10 || (data.state === 'unavailable' && data.rows.length !== 0)
        || Object.keys(data).some(key => !['kind','state','rows','owner','repository','target','serverOrigin'].includes(key))) return undefined;
    const rows: HistoryRow[] = [];
    let previous = Number.MAX_SAFE_INTEGER;
    for (const row of data.rows as Record<string, unknown>[]) {
        if (!row || typeof row !== 'object' || !positive(row.sourceId) || row.sourceId >= previous || !isHistoryCommand(row.command)
            || !OPERATION_OUTCOMES.includes(row.outcome as never)
            || ('receiptId' in row && (!positive(row.receiptId) || row.receiptId <= row.sourceId))
            || ('commitSha' in row && (typeof row.commitSha !== 'string' || canonicalGitObjectId(row.commitSha) !== row.commitSha
                || row.outcome !== 'applied' || !row.receiptId))
            || Object.keys(row).some(key => !['sourceId','command','outcome','receiptId','commitSha'].includes(key))) return undefined;
        rows.push(Object.freeze({ sourceId: row.sourceId, command: row.command, outcome: row.outcome as HistoryRow['outcome'],
            ...(row.receiptId ? { receiptId: row.receiptId as number } : {}), ...(row.commitSha ? { commitSha: row.commitSha as string } : {}) }));
        previous = row.sourceId;
    }
    return Object.freeze({ kind: 'history-command', state: data.state as HistoryProjection['state'], rows: Object.freeze(rows),
        owner: data.owner, repository: data.repository, serverOrigin: data.serverOrigin,
        target: Object.freeze({ kind: target.kind as 'pr' | 'issue', number: bound.number }) });
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
