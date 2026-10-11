import { readSddGateRecord, SDD_GATE_MARKER, type SddGateRecord } from '../../domain/pre_branch_sdd';

export interface SddQueryComment {
    readonly id: number;
    readonly body: string | null;
    readonly user?: { readonly login?: string };
}

export type SddCardSelection =
    | { readonly state: 'absent' | 'invalid' | 'unavailable' }
    | { readonly state: 'valid'; readonly id: number; readonly body: string; readonly record: SddGateRecord };

/** The latest owned card is authoritative even when invalid; an older card cannot restore readiness. */
export function selectOwnedSddCard(comments: readonly SddQueryComment[], issueNumber: number, trustedBotLogin: string): SddCardSelection {
    const login = trustedBotLogin.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,38}(?:\[bot\])?$/u.test(login)) return { state: 'unavailable' };
    const candidates = comments.filter(comment => comment.user?.login?.toLowerCase() === login && typeof comment.body === 'string'
        && (comment.body.includes(SDD_GATE_MARKER) || /^## (?:SDD work status|Estado del SDD)\s*$/mu.test(comment.body)));
    if (!candidates.length) return { state: 'absent' };
    if (candidates.some(comment => !Number.isSafeInteger(comment.id) || comment.id < 1)) return { state: 'invalid' };
    const latestId = Math.max(...candidates.map(comment => comment.id));
    const latest = candidates.filter(comment => comment.id === latestId);
    const bodies = new Set(latest.map(comment => comment.body));
    if (bodies.size !== 1) return { state: 'invalid' };
    const body = latest[0].body!;
    if ([...body.matchAll(/<!--\s*copilot:sdd-gate:v1/gu)].length !== 1) return { state: 'invalid' };
    const record = readSddGateRecord(body, issueNumber);
    if (record?.answers?.some(answer => !Number.isSafeInteger(answer.commentId) || answer.commentId < 1)) return { state: 'invalid' };
    return record ? Object.freeze({ state: 'valid', id: latestId, body, record }) : { state: 'invalid' };
}
