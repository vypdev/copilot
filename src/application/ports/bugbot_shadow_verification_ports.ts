import type { AgentConfiguration } from '../../domain/agent';

export interface BugbotShadowAnchor {
    readonly path: string;
    readonly line: number;
    readonly end: number;
    readonly side?: 'LEFT' | 'RIGHT';
}

export interface BugbotShadowCandidate {
    readonly id: string;
    readonly hypothesis: string;
    readonly anchor: BugbotShadowAnchor;
    readonly repository: { readonly owner: string; readonly name: string };
    readonly pullRequest?: number;
    readonly headSha: string;
    readonly baseSha?: string;
    readonly allowBase: boolean;
}

export interface BugbotShadowCitation {
    readonly receipt: string;
    readonly kind: 'git' | 'official' | 'runtime' | 'ci';
    readonly first: number;
    readonly last: number;
    readonly sha?: string;
    readonly path?: string;
    readonly url?: string;
    readonly textSha256: string;
}

interface BugbotShadowOrderEvidence {
    readonly excerpt: string;
    readonly citation: BugbotShadowCitation;
}

export interface BugbotShadowInvestigationMetrics {
    readonly operation: string;
    readonly turnDurationsMs: readonly number[];
    readonly closureRepairs: number;
    readonly contextRestarts: number;
    readonly turns: readonly {
        readonly failure: string | null;
        readonly reportedModel?: string;
        readonly usage?: Readonly<Record<string, number>>;
    }[];
    readonly evidence: readonly {
        readonly turn: number;
        readonly operation: string;
        readonly target: string;
        readonly purpose: string;
        readonly revision: string;
        readonly outcome: string;
        readonly cacheHits: number;
        readonly delivered: readonly {
            readonly receipt: string;
            readonly alias?: string;
            readonly path?: string;
            readonly url?: string;
            readonly sha?: string;
            readonly version?: string;
            readonly versionScope?: string;
            readonly first: number;
            readonly last: number;
        }[];
    }[];
}

export type BugbotShadowResult = { readonly investigation?: BugbotShadowInvestigationMetrics } & (
    | {
        readonly status: 'verdict';
        readonly verdict: 'confirmed' | 'refuted' | 'inconclusive';
        readonly reason: string;
        readonly missing: string | null;
        readonly citations: readonly BugbotShadowCitation[];
        readonly premises: readonly {
            readonly claim: string;
            readonly citations: readonly BugbotShadowCitation[];
            readonly order: readonly {
                readonly route: string;
                readonly first: readonly BugbotShadowOrderEvidence[];
                readonly second: readonly BugbotShadowOrderEvidence[];
                readonly mechanism: readonly BugbotShadowOrderEvidence[];
            }[];
        }[];
        readonly reportedModel?: string;
      }
    | {
        readonly status: 'technical-failure';
        readonly reason: string;
        readonly reportedModel?: string;
      });

/** Trusted adapter validates the delivered receipts in an independent read-only session. */
export interface BugbotShadowVerificationPort {
    verify(request: {
        readonly candidate: BugbotShadowCandidate;
        readonly configuration: Readonly<AgentConfiguration>;
        readonly signal?: AbortSignal;
        /** Opaque operation identity for review-local reuse of authenticated sources. */
        readonly review?: object;
    }): Promise<BugbotShadowResult>;
}
