import { readSddGateRecord, SDD_GATE_MARKER, type SddGateRecord } from '../../domain/pre_branch_sdd';
import { parsePublicationMarker, parsePublicationReplyMarker, parsePublicationTransitionMarker } from './publication_identity_policy';

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
    const owned = comments.filter(comment => comment.user?.login?.toLowerCase() === login);
    const versions = new Map<number, Set<string | null>>();
    for (const comment of owned) {
        const bodies = versions.get(comment.id) ?? new Set<string | null>();
        bodies.add(comment.body);
        versions.set(comment.id, bodies);
    }
    // Unknown owned comments are potential damaged SDD cards. Unsafe IDs and
    // ambiguous duplicate bodies cannot be filtered as another product surface.
    const candidates = owned.filter(comment => !Number.isSafeInteger(comment.id) || comment.id < 1
        || versions.get(comment.id)!.size !== 1 || !isOtherOwnedPublication(comment.body, issueNumber));
    if (!candidates.length) return { state: 'absent' };
    if (candidates.some(comment => !Number.isSafeInteger(comment.id) || comment.id < 1)) return { state: 'invalid' };
    const latestId = Math.max(...candidates.map(comment => comment.id));
    const latest = candidates.filter(comment => comment.id === latestId);
    const bodies = new Set(latest.map(comment => comment.body));
    if (bodies.size !== 1) return { state: 'invalid' };
    const body = latest[0].body;
    if (typeof body !== 'string') return { state: 'invalid' };
    if ([...body.matchAll(/<!--\s*copilot:sdd-gate:v1/gu)].length !== 1) return { state: 'invalid' };
    const record = readSddGateRecord(body, issueNumber);
    if (record?.answers?.some(answer => !Number.isSafeInteger(answer.commentId) || answer.commentId < 1)) return { state: 'invalid' };
    return record ? Object.freeze({ state: 'valid', id: latestId, body, record }) : { state: 'invalid' };
}

/** Only a single canonical header for another exact-target product surface is excluded. */
function isOtherOwnedPublication(body: string | null, issueNumber: number): boolean {
    if (typeof body !== 'string' || body.includes(SDD_GATE_MARKER)
        || /^## (?:SDD work status|Estado del SDD)\s*$/mu.test(body)) return false;
    const header = body.split('\n', 1)[0];
    if (!/^<!-- copilot:(?:publication|reply|transition) /.test(header)
        || [...body.matchAll(/<!-- copilot:(?:publication|reply|transition) /gu)].length !== 1) return false;
    const publication = parsePublicationMarker(header);
    const transition = parsePublicationTransitionMarker(header);
    const identity = publication?.identity ?? transition?.identity;
    if (identity) return identity.target.kind === 'issue' && identity.target.number === issueNumber;
    return parsePublicationReplyMarker(header)?.target === `issue:${issueNumber}`;
}
