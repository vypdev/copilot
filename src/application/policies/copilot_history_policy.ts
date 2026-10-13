import { parseCopilotCommand } from '../../domain/copilot_command';
import { isHistoryCommand, readOperationEvidence, type HistoryCommand, type OperationOutcome } from '../../domain/copilot_operation';
import { githubUsersMatch } from '../../domain/github_user_policy';
import { buildPublicationReplyMarker, parsePublicationReplyMarker } from './publication_identity_policy';

export interface HistoryComment {
    readonly id: number;
    readonly body: string | null;
    readonly author: string;
    readonly automated?: boolean;
}
export interface HistoryRow {
    readonly sourceId: number;
    readonly command: HistoryCommand;
    readonly outcome: OperationOutcome;
    readonly receiptId?: number;
    readonly commitSha?: string;
}
export interface CopilotHistory {
    readonly kind: 'history-command';
    readonly state: 'complete' | 'partial' | 'unavailable' | 'unsupported-surface';
    readonly rows: readonly HistoryRow[];
}
export const HISTORY_UNAVAILABLE: CopilotHistory = Object.freeze({ kind: 'history-command', state: 'unavailable', rows: Object.freeze([]) });
export const HISTORY_UNSUPPORTED_SURFACE: CopilotHistory = Object.freeze({ kind: 'history-command', state: 'unsupported-surface', rows: Object.freeze([]) });
const KEYS: Readonly<Record<HistoryCommand, readonly string[]>> = Object.freeze({
    'sync-branch': ['branch-sync-result', 'application-error'], remember: ['state-command-result', 'application-error'],
    dismiss: ['state-command-result', 'application-error'], implement: ['implementation-result', 'application-error'],
    fix: ['fix-result', 'application-error'],
});

export function selectCopilotHistory(input: {
    readonly target: string;
    readonly queryId: number;
    readonly botLogin: string;
    readonly complete: boolean;
    readonly comments: readonly HistoryComment[];
}): CopilotHistory {
    if (!/^(?:issue|pr):[1-9]\d*$/u.test(input.target) || !positive(Number(input.target.split(':')[1])) || !positive(input.queryId)
        || !/^[A-Za-z0-9-]{1,100}(?:\[bot\])?$/u.test(input.botLogin) || input.comments.length > 1000) return HISTORY_UNAVAILABLE;
    const seen = new Set<number>();
    if (input.comments.some(comment => !positive(comment.id) || seen.has(comment.id) || !seen.add(comment.id))) return HISTORY_UNAVAILABLE;
    if (!input.complete && input.comments.length === 0) return HISTORY_UNAVAILABLE;
    const rows = input.comments.flatMap(source => {
        if (source.id >= input.queryId || source.automated || !source.author || githubUsersMatch(source.author, input.botLogin)) return [];
        const parsed = parseCopilotCommand(source.body);
        if (parsed.kind !== 'command' || !isHistoryCommand(parsed.command.name)) return [];
        const command = parsed.command.name;
        const receipts = input.comments.flatMap(comment => {
            if (comment.id <= source.id || !githubUsersMatch(comment.author, input.botLogin) || !comment.body) return [];
            const marker = parsePublicationReplyMarker(comment.body);
            if (!marker || marker.target !== input.target || marker.correlationId !== `comment:${source.id}`
                || !KEYS[command].includes(marker.messageKey)
                || !comment.body.startsWith(buildPublicationReplyMarker(marker))
                || comment.body.split('<!-- copilot:reply').length !== 2) return [];
            const evidence = readOperationEvidence(comment.body);
            const compatible = marker.messageKey === 'application-error'
                ? ['blocked', 'partial', 'failed', 'unavailable'].includes(evidence?.outcome ?? '')
                : ['applied', 'already-current', 'not-applied'].includes(evidence?.outcome ?? '');
            return [{ id: comment.id, evidence: compatible ? evidence : undefined, legacy: !comment.body.includes('<!-- copilot:operation:') }];
        });
        // A malformed or legacy receipt cannot establish the effect; disagreeing receipts cannot be selected.
        const qualified = receipts.filter(receipt => receipt.evidence?.target === input.target
            && receipt.evidence.correlationId === `comment:${source.id}` && receipt.evidence.command === command);
        const evidence = qualified[0]?.evidence;
        const agreement = evidence && qualified.length === receipts.length
            && qualified.every(receipt => receipt.evidence?.outcome === evidence.outcome && receipt.evidence?.commitSha === evidence.commitSha);
        return [Object.freeze<HistoryRow>({ sourceId: source.id, command, outcome: agreement ? evidence.outcome : 'unavailable',
            ...(!agreement && receipts.length === 1 && receipts[0].legacy ? { receiptId: receipts[0].id } : {}),
            ...(agreement ? { receiptId: Math.min(...qualified.map(receipt => receipt.id)),
                ...(evidence.commitSha ? { commitSha: evidence.commitSha } : {}) } : {}) })];
    }).sort((a, b) => b.sourceId - a.sourceId).slice(0, 10);
    return Object.freeze({ kind: 'history-command', state: input.complete ? 'complete' : 'partial', rows: Object.freeze(rows) });
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
