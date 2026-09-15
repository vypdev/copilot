import { createHash } from 'node:crypto';
import {
    PUBLICATION_TOPICS,
    publicationTargetToken,
    type PublicationIdentity,
    type PublicationTopic,
    type TransitionPublicationIntent,
} from '../../domain/github_publication';

export const PUBLICATION_SCHEMA = '1';
export const PUBLICATION_MARKER_PREFIX = 'copilot:publication';
export const PUBLICATION_DUPLICATE_MARKER_PREFIX = 'copilot:publication-duplicate';
export const PUBLICATION_REPLY_MARKER_PREFIX = 'copilot:reply';
export const PUBLICATION_TRANSITION_MARKER_PREFIX = 'copilot:transition';
export const TRANSITION_FINGERPRINT_ACTIONS = Object.freeze([
    'branch-sync-required',
] as const);
export type TransitionFingerprintAction = typeof TRANSITION_FINGERPRINT_ACTIONS[number];
const SAFE_VALUE = /^[A-Za-z0-9._:-]{1,128}$/u;
const DIGEST = /^[a-f0-9]{8,64}$/u;

export interface PublicationMarker {
    readonly identity: PublicationIdentity;
    readonly sourceVersion: string;
    readonly digest: string;
}

export interface PublicationReplyMarker {
    readonly target: string;
    readonly correlationId: string;
    readonly messageKey: string;
    readonly digest: string;
}

export interface PublicationTransitionMarker {
    readonly identity: PublicationIdentity;
    readonly fingerprint: string;
    readonly messageKey: string;
}

export function createSemanticDigest(value: unknown): string {
    return createHash('sha256').update(stableSerialize(value), 'utf8').digest('hex').slice(0, 16);
}

/** Derives a notification identity exclusively from trusted, bounded transition facts. */
export function createTransitionFingerprint(
    identity: PublicationIdentity,
    action: TransitionFingerprintAction,
    sourceVersion: string,
): string {
    const target = publicationTargetToken(identity.target);
    for (const value of [identity.topic, target, identity.key, action, sourceVersion]) {
        if (!SAFE_VALUE.test(value)) throw new Error('Transition fingerprint contains an unsafe identity value.');
    }
    if (!TRANSITION_FINGERPRINT_ACTIONS.includes(action)) {
        throw new Error('Transition fingerprint contains an unknown action.');
    }
    return createSemanticDigest({
        action,
        identity: { key: identity.key, target, topic: identity.topic },
        sourceVersion,
    });
}

export function buildPublicationMarker(marker: PublicationMarker): string {
    const target = publicationTargetToken(marker.identity.target);
    for (const value of [marker.identity.topic, target, marker.identity.key, marker.sourceVersion]) {
        if (!SAFE_VALUE.test(value)) throw new Error('Publication marker contains an unsafe identity value.');
    }
    if (!DIGEST.test(marker.digest)) throw new Error('Publication marker contains an invalid digest.');
    return `<!-- ${PUBLICATION_MARKER_PREFIX} schema="${PUBLICATION_SCHEMA}" topic="${marker.identity.topic}" target="${target}" key="${marker.identity.key}" source="${marker.sourceVersion}" digest="${marker.digest}" -->`;
}

export function parsePublicationMarker(body: string | null | undefined): PublicationMarker | undefined {
    if (typeof body !== 'string') return undefined;
    const match = body.match(/<!-- copilot:publication schema="1" topic="([A-Za-z0-9._:-]{1,128})" target="(issue|pr):(\d+)" key="([A-Za-z0-9._:-]{1,128})" source="([A-Za-z0-9._:-]{1,128})" digest="([a-f0-9]{8,64})" -->/u);
    if (!match) return undefined;
    const topic = match[1] as PublicationTopic;
    if (!PUBLICATION_TOPICS.includes(topic)) return undefined;
    const number = Number(match[3]);
    if (!Number.isSafeInteger(number) || number < 1) return undefined;
    return Object.freeze({
        identity: Object.freeze({
            topic,
            target: Object.freeze({ kind: match[2] === 'pr' ? 'pull-request' : 'issue', number }),
            key: match[4],
        }),
        sourceVersion: match[5],
        digest: match[6],
    });
}

export function buildPublicationReplyMarker(marker: PublicationReplyMarker): string {
    for (const value of [marker.target, marker.correlationId, marker.messageKey]) {
        if (!SAFE_VALUE.test(value)) throw new Error('Publication reply marker contains an unsafe identity value.');
    }
    if (!DIGEST.test(marker.digest)) throw new Error('Publication reply marker contains an invalid digest.');
    return `<!-- ${PUBLICATION_REPLY_MARKER_PREFIX} schema="${PUBLICATION_SCHEMA}" target="${marker.target}" correlation="${marker.correlationId}" key="${marker.messageKey}" digest="${marker.digest}" -->`;
}

export function parsePublicationReplyMarker(body: string | null | undefined): PublicationReplyMarker | undefined {
    if (typeof body !== 'string') return undefined;
    const match = body.match(/<!-- copilot:reply schema="1" target="((?:issue|pr):\d+)" correlation="([A-Za-z0-9._:-]{1,128})" key="([A-Za-z0-9._:-]{1,128})" digest="([a-f0-9]{8,64})" -->/u);
    if (!match) return undefined;
    return Object.freeze({ target: match[1], correlationId: match[2], messageKey: match[3], digest: match[4] });
}

export function buildPublicationTransitionMarker(
    intent: Pick<TransitionPublicationIntent, 'identity' | 'fingerprint' | 'messageKey'>,
): string {
    const target = publicationTargetToken(intent.identity.target);
    for (const value of [intent.identity.topic, target, intent.identity.key, intent.messageKey]) {
        if (!SAFE_VALUE.test(value)) throw new Error('Publication transition marker contains an unsafe identity value.');
    }
    if (!DIGEST.test(intent.fingerprint)) {
        throw new Error('Publication transition marker contains an invalid fingerprint.');
    }
    return `<!-- ${PUBLICATION_TRANSITION_MARKER_PREFIX} schema="${PUBLICATION_SCHEMA}" topic="${intent.identity.topic}" target="${target}" key="${intent.identity.key}" fingerprint="${intent.fingerprint}" message="${intent.messageKey}" -->`;
}

export function parsePublicationTransitionMarker(
    body: string | null | undefined,
): PublicationTransitionMarker | undefined {
    if (typeof body !== 'string') return undefined;
    const match = body.match(/<!-- copilot:transition schema="1" topic="([A-Za-z0-9._:-]{1,128})" target="(issue|pr):(\d+)" key="([A-Za-z0-9._:-]{1,128})" fingerprint="([a-f0-9]{8,64})" message="([A-Za-z0-9._:-]{1,128})" -->/u);
    if (!match) return undefined;
    const topic = match[1] as PublicationTopic;
    if (!PUBLICATION_TOPICS.includes(topic)) return undefined;
    const number = Number(match[3]);
    if (!Number.isSafeInteger(number) || number < 1) return undefined;
    return Object.freeze({
        identity: Object.freeze({
            topic,
            target: Object.freeze({ kind: match[2] === 'pr' ? 'pull-request' : 'issue', number }),
            key: match[4],
        }),
        fingerprint: match[5],
        messageKey: match[6],
    });
}

/**
 * Reads the stable issue-comment identity plus the short-lived namespaced form
 * emitted during migration. Review-comment identities remain transport-scoped.
 */
export function readablePublicationReplyCorrelationIds(
    correlationId: string,
): readonly string[] {
    const issueComment = correlationId.match(/^comment:([1-9]\d*)$/u);
    return Object.freeze(issueComment
        ? [correlationId, `comment:issue_comment:${issueComment[1]}`]
        : [correlationId]);
}

export function buildDuplicateMarker(canonicalCommentId: number): string {
    if (!Number.isSafeInteger(canonicalCommentId) || canonicalCommentId < 1) {
        throw new Error('Canonical comment id must be a positive integer.');
    }
    return `<!-- ${PUBLICATION_DUPLICATE_MARKER_PREFIX} schema="${PUBLICATION_SCHEMA}" canonical="${canonicalCommentId}" -->`;
}

function stableSerialize(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}
