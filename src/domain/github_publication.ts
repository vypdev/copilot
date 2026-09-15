export const PUBLICATION_TOPICS = [
    'plan',
    'progress',
    'branch-sync',
    'bugbot',
    'release',
    'inactivity',
    'access-policy',
] as const;

export type PublicationTopic = typeof PUBLICATION_TOPICS[number];
export type PublicationTargetKind = 'issue' | 'pull-request';

export interface PublicationTarget {
    readonly kind: PublicationTargetKind;
    readonly number: number;
}

export interface PublicationIdentity {
    readonly topic: PublicationTopic;
    readonly target: PublicationTarget;
    readonly key: string;
}

export type NoPublicationReason =
    | 'routine'
    | 'no-op'
    | 'duplicate'
    | 'stale-source'
    | 'feature-owned'
    | 'missing-target'
    | 'missing-owner';

export interface NoPublicationIntent {
    readonly kind: 'none';
    readonly reason: NoPublicationReason;
}

export interface ReplyPublicationIntent<TProjection = unknown> {
    readonly kind: 'reply';
    readonly target: PublicationTarget;
    readonly correlationId: string;
    readonly messageKey: string;
    readonly locale: string;
    readonly digest: string;
    readonly projection: Readonly<TProjection>;
}

export interface StatusPublicationIntent<TProjection = unknown> {
    readonly kind: 'status';
    readonly identity: PublicationIdentity;
    readonly sourceVersion: string;
    readonly digest: string;
    readonly locale: string;
    readonly projection: Readonly<TProjection>;
    readonly sourceGuard?: Readonly<{
        readonly kind: 'branch-head';
        readonly branch: string;
        readonly sha: string;
    }>;
}

export interface TransitionPublicationIntent {
    readonly kind: 'transition';
    readonly identity: PublicationIdentity;
    readonly fingerprint: string;
    readonly messageKey: string;
    readonly locale: string;
    readonly values: Readonly<Record<string, string | number>>;
}

export interface InlineFindingPublicationIntent {
    readonly kind: 'inline-finding';
    readonly identity: string;
    readonly path: string;
    readonly line: number;
    readonly severity: 'info' | 'low' | 'medium' | 'high';
    readonly title: string;
    readonly evidence: string;
}

export type PublicationIntent<TProjection = unknown, TReplyProjection = unknown> =
    | NoPublicationIntent
    | ReplyPublicationIntent<TReplyProjection>
    | StatusPublicationIntent<TProjection>
    | TransitionPublicationIntent
    | InlineFindingPublicationIntent;

export function publicationIdentityEquals(left: PublicationIdentity, right: PublicationIdentity): boolean {
    return left.topic === right.topic
        && left.target.kind === right.target.kind
        && left.target.number === right.target.number
        && left.key === right.key;
}

export function publicationTargetToken(target: PublicationTarget): string {
    if (target.kind !== 'issue' && target.kind !== 'pull-request') {
        throw new Error('Publication target kind must be issue or pull-request.');
    }
    if (!Number.isSafeInteger(target.number) || target.number < 1) {
        throw new Error('Publication target number must be a positive safe integer.');
    }
    return `${target.kind === 'pull-request' ? 'pr' : 'issue'}:${target.number}`;
}
