import { canonicalGitObjectId } from './git_object_id';

export const HISTORY_COMMANDS = ['sync-branch', 'remember', 'dismiss', 'implement', 'fix'] as const;
export type HistoryCommand = typeof HISTORY_COMMANDS[number];
export const OPERATION_OUTCOMES = ['applied', 'already-current', 'not-applied', 'blocked', 'partial', 'failed', 'unavailable'] as const;
export type OperationOutcome = typeof OPERATION_OUTCOMES[number];
export interface OperationEvidence {
    readonly version: 1;
    readonly target: string;
    readonly correlationId: string;
    readonly command: HistoryCommand;
    readonly outcome: OperationOutcome;
    readonly commitSha?: string;
}
export const OPERATION_MARKER_PREFIX = '<!-- copilot:operation:v1 ';

export function isHistoryCommand(value: unknown): value is HistoryCommand {
    return HISTORY_COMMANDS.includes(value as HistoryCommand);
}
export function readOperationEvidence(body: string): OperationEvidence | undefined {
    if (body.split('<!-- copilot:operation:').length !== 2) return undefined;
    const match = body.match(/<!-- copilot:operation:v1 ([\s\S]{1,1200}?) -->/u);
    if (!match) return undefined;
    try { return validateOperationEvidence(JSON.parse(match[1])); } catch { return undefined; }
}
export function validateOperationEvidence(value: unknown): OperationEvidence | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const item = value as Record<string, unknown>;
    if (Object.keys(item).some(key => !['version', 'target', 'correlationId', 'command', 'outcome', 'commitSha'].includes(key))
        || item.version !== 1 || !validIdentity(item.target, /^(?:issue|pr):([1-9]\d*)$/u)
        || !validIdentity(item.correlationId, /^comment:([1-9]\d*)$/u)
        || !isHistoryCommand(item.command) || !OPERATION_OUTCOMES.includes(item.outcome as OperationOutcome)
        || ('commitSha' in item && (typeof item.commitSha !== 'string' || canonicalGitObjectId(item.commitSha) !== item.commitSha || item.outcome !== 'applied'))) return undefined;
    return Object.freeze({ version: 1, target: item.target as string, correlationId: item.correlationId as string,
        command: item.command, outcome: item.outcome as OperationOutcome,
        ...('commitSha' in item ? { commitSha: item.commitSha as string } : {}) });
}
/** Only trusted finalized producers call this; a SHA requires independent post-push agreement. */
export function buildOperationEvidenceMarker(
    evidence: Omit<OperationEvidence, 'version' | 'commitSha'>,
    pushedRevision?: { readonly localSha: string; readonly remoteSha: string },
): string {
    const sha = pushedRevision && canonicalGitObjectId(pushedRevision.localSha);
    const value = validateOperationEvidence({ version: 1, ...evidence,
        ...(sha && pushedRevision?.remoteSha === sha && evidence.outcome === 'applied' ? { commitSha: sha } : {}) });
    if (!value) throw new Error('Invalid operation evidence.');
    return `${OPERATION_MARKER_PREFIX}${JSON.stringify(value)} -->`;
}
function validIdentity(value: unknown, pattern: RegExp): boolean {
    if (typeof value !== 'string') return false;
    const match = value.match(pattern);
    return Boolean(match && Number.isSafeInteger(Number(match[1])));
}
