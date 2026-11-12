import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BugbotShadowCandidate, BugbotShadowInvestigationMetrics, BugbotShadowResult, BugbotShadowVerificationPort } from '../../application/ports/bugbot_shadow_verification_ports';
import type { AgentConfiguration } from '../../domain/agent';
import { redactSensitiveText } from '../../domain/security/sensitive_text';
import { canonicalGitObjectId } from '../../domain/git_object_id';

export interface BugbotShadowSource {
    readonly repo: string;
    readonly officialDirectory?: string;
    readonly catalog?: readonly {
        readonly package: string;
        readonly version: string;
        readonly kind: string;
        readonly file: string;
        readonly url: string;
        readonly commit: string;
        readonly sha256: string;
    }[];
    readonly resolvedVersions?: readonly {
        readonly package: string;
        readonly version: string;
        readonly scope: string;
        readonly sha: string;
        readonly path: string;
        readonly blob: string;
        readonly first: number;
        readonly last: number;
    }[];
    readonly localRuntime?: { readonly python: string; readonly sqlite: string; readonly scope: string };
}

interface TurnRequest {
    readonly cwd: string;
    readonly prompt: string;
    readonly schema: object;
    readonly threadId?: string;
    readonly signal?: AbortSignal;
    readonly configuration: Readonly<AgentConfiguration>;
    readonly candidateId: string;
}

interface TurnResult {
    readonly response?: unknown;
    readonly threadId?: string;
    readonly fact: { readonly failure: string | null; readonly reportedModel?: string; readonly usage?: Readonly<Record<string, number>> };
}

type Verdict = Extract<BugbotShadowResult, { status: 'verdict' }>;
type Log = (entry: object) => void;
type SharedRead = <T>(key: string, read: () => T, onHit: () => void) => T;
type Evidence = BugbotShadowInvestigationMetrics['evidence'][number];

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Git and official-source reads are shared with the CommonJS broker.
const { createSourceCache } = require('./shadow/source_cache.cjs') as { createSourceCache(): SharedRead };

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Shared with the executable CommonJS pilot controls.
const { git, blob } = require('./shadow/git.cjs') as {
    git(repo: string, args: string[]): string;
    blob(repo: string, sha: string, path: string): { lines: readonly string[] };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Shared with the executable CommonJS pilot controls.
const { ask } = require('./shadow/session.cjs') as { ask(request: TurnRequest): Promise<TurnResult> };
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Shared with the executable CommonJS pilot controls.
const { investigate } = require('./shadow/run.cjs') as {
    investigate(
        source: BugbotShadowSource,
        subject: { repository: string; head: string; base: string; tree: string; baseTree: string },
        finding: { id: string; hypothesis: string; detectorLocation: BugbotShadowCandidate['anchor']; allowBase: boolean },
        cwd: string,
        transport: (request: Omit<TurnRequest, 'configuration' | 'candidateId'>) => Promise<TurnResult>,
        log: Log,
        signal?: AbortSignal,
        options?: { lifecycle: boolean; sharedRead?: SharedRead },
    ): Promise<{
        answer: (Pick<Verdict, 'reason' | 'missing' | 'citations' | 'premises'> & { label: Verdict['verdict'] }) | null;
        failure: string | null;
        turns: readonly TurnResult['fact'][];
        operation: string;
        turnDurationsMs?: readonly number[];
        contextRestarts?: number;
        closures: readonly object[];
        actions: readonly {
            readonly turn: number;
            readonly request: { readonly op: string; readonly target: string; readonly why: string; readonly revision: string };
            readonly result: { readonly status: string; readonly cacheHits?: number; readonly sources?: Evidence['delivered'] };
            readonly delivered?: boolean;
        }[];
    }>;
};

interface ShadowVerifierOptions {
    readonly resolveSource: (candidate: BugbotShadowCandidate) => BugbotShadowSource | undefined;
    readonly log?: Log;
    readonly transport?: (request: TurnRequest) => Promise<TurnResult>;
    /** Frozen replay callers can retain their original prompt and response schema. */
    readonly lifecycle?: boolean;
}

const failure = (reason: string): BugbotShadowResult => ({ status: 'technical-failure', reason });

/** Composition supplies an authorized object store. The verifier receives no SCM or mutation ports. */
export function createPinnedBugbotShadowVerifier({
    resolveSource, log = () => undefined, transport = ask, lifecycle = true,
}: ShadowVerifierOptions): BugbotShadowVerificationPort {
    const reviewCaches = new WeakMap<object, SharedRead>();
    return {
        async verify({ candidate, configuration, signal, review }) {
            if (configuration.provider !== 'codex') return failure('shadow-provider-unavailable');
            if (signal?.aborted) return failure('investigation-canceled');
            const head = canonicalGitObjectId(candidate.headSha);
            const base = canonicalGitObjectId(candidate.baseSha ?? candidate.headSha);
            if (!head || !base || (candidate.allowBase && !candidate.baseSha)) return failure('shadow-revision-unavailable');
            const source = resolveSource(candidate);
            if (!source) return failure('shadow-source-unavailable');
            if (git(source.repo, ['remote']) !== '') return failure('shadow-repository-remote');
            const { owner, name } = candidate.repository;
            const subject = {
                repository: `${owner}/${name}`, head, base,
                tree: git(source.repo, ['rev-parse', `${head}^{tree}`]).trim(),
                baseTree: git(source.repo, ['rev-parse', `${base}^{tree}`]).trim(),
            };
            const { path, line, end, side } = candidate.anchor;
            const anchor = blob(source.repo, side === 'LEFT' ? base : head, path);
            if (line < 1 || end < line || end > anchor.lines.length) return failure('shadow-anchor-unavailable');
            const cache = review && lifecycle ? reviewCaches.get(review) ?? createSourceCache() : undefined;
            if (review && cache) reviewCaches.set(review, cache);
            const sharedRead: SharedRead | undefined = cache && ((key, read, onHit) =>
                cache(JSON.stringify([candidate.repository.owner, candidate.repository.name, source.repo, key]), read, onHit));
            const cwd = mkdtempSync(join(tmpdir(), 'bugbot-shadow-'));
            try {
                const result = await investigate(source, subject, {
                    id: candidate.id, hypothesis: candidate.hypothesis, detectorLocation: candidate.anchor, allowBase: candidate.allowBase,
                }, cwd, async request => {
                    const turn = await transport({ ...request, configuration, candidateId: candidate.id });
                    if (turn.fact.reportedModel && turn.fact.reportedModel !== configuration.model) {
                        return { ...turn, fact: { ...turn.fact, failure: 'reported-model-mismatch' } };
                    }
                    return turn;
                }, log, signal, { lifecycle, sharedRead });
                log({ ...result, resolvedModel: configuration.model });
                const reported = result.turns.flatMap(turn => turn.reportedModel ? [turn.reportedModel] : []);
                const reportedModel = reported.find(model => model !== configuration.model) ?? reported[0];
                const investigation: BugbotShadowInvestigationMetrics | undefined = lifecycle ? {
                    operation: result.operation,
                    turnDurationsMs: result.turnDurationsMs ?? [],
                    contextRestarts: result.contextRestarts ?? 0,
                    closureRepairs: result.closures.length,
                    turns: result.turns.map(({ failure, reportedModel, usage }) => ({ failure, reportedModel, usage })),
                    evidence: result.actions.map(({ request, result, turn, delivered }) => ({
                        turn, operation: request.op, revision: request.revision, target: redactSensitiveText(request.target),
                        purpose: redactSensitiveText(request.why), outcome: result.status, cacheHits: result.cacheHits ?? 0,
                        delivered: delivered ? result.sources?.map(({ receipt, alias, path, url, sha, version, versionScope, first, last }) =>
                            ({ receipt, alias, path, url, sha, version, versionScope, first, last })) ?? [] : [],
                    })),
                } : undefined;
                if (!result.answer) return { status: 'technical-failure', reason: result.failure ?? 'verifier-unavailable', reportedModel, investigation };
                const { label, reason, missing, citations, premises } = result.answer;
                return { status: 'verdict', verdict: label, reason, missing, citations, premises, reportedModel, investigation };
            } finally {
                rmSync(cwd, { recursive: true, force: true });
            }
        },
    };
}
