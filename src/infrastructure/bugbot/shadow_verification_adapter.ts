import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BugbotShadowCandidate, BugbotShadowResult, BugbotShadowVerificationPort } from '../../application/ports/bugbot_shadow_verification_ports';
import type { AgentConfiguration } from '../../domain/agent';
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
    readonly localRuntime?: { readonly python: string; readonly sqlite: string; readonly scope: string };
}

interface TurnRequest {
    readonly cwd: string;
    readonly prompt: string;
    readonly schema: object;
    readonly threadId?: string;
    readonly signal?: AbortSignal;
    readonly configuration: Readonly<AgentConfiguration>;
}

interface TurnResult {
    readonly response?: unknown;
    readonly threadId?: string;
    readonly fact: { readonly failure: string | null; readonly reportedModel?: string };
}

type Verdict = Extract<BugbotShadowResult, { status: 'verdict' }>;
type Log = (entry: object) => void;

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
        transport: (request: Omit<TurnRequest, 'configuration'>) => Promise<TurnResult>,
        log: Log,
        signal?: AbortSignal,
    ): Promise<{
        answer: (Pick<Verdict, 'reason' | 'missing' | 'citations' | 'premises'> & { label: Verdict['verdict'] }) | null;
        failure: string | null;
        turns: readonly TurnResult['fact'][];
    }>;
};

interface ShadowVerifierOptions {
    readonly resolveSource: (candidate: BugbotShadowCandidate) => BugbotShadowSource | undefined;
    readonly log?: Log;
    readonly transport?: (request: TurnRequest) => Promise<TurnResult>;
}

const failure = (reason: string): BugbotShadowResult => ({ status: 'technical-failure', reason });

/** Composition supplies an authorized object store. The verifier receives no SCM or mutation ports. */
export function createPinnedBugbotShadowVerifier({
    resolveSource, log = () => undefined, transport = ask,
}: ShadowVerifierOptions): BugbotShadowVerificationPort {
    return {
        async verify({ candidate, configuration, signal }) {
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
            const cwd = mkdtempSync(join(tmpdir(), 'bugbot-shadow-'));
            try {
                const result = await investigate(source, subject, {
                    id: candidate.id, hypothesis: candidate.hypothesis, detectorLocation: candidate.anchor, allowBase: candidate.allowBase,
                }, cwd, request => transport({ ...request, configuration }), log, signal);
                log({ ...result, resolvedModel: configuration.model });
                const reported = result.turns.flatMap(turn => turn.reportedModel ? [turn.reportedModel] : []);
                const reportedModel = reported.find(model => model !== configuration.model) ?? reported[0];
                if (!result.answer) return { status: 'technical-failure', reason: result.failure ?? 'verifier-unavailable', reportedModel };
                const { label, reason, missing, citations, premises } = result.answer;
                return { status: 'verdict', verdict: label, reason, missing, citations, premises, reportedModel };
            } finally {
                rmSync(cwd, { recursive: true, force: true });
            }
        },
    };
}
