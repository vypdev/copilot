import { createHash } from 'node:crypto';
import {
    isBugbotStatusCardSource, readBugbotStatusCardHead, type BugbotStatusCardWakeup,
} from '../../application/policies/bugbot_status_card_publication_policy';
import { parsePositiveSafeInteger } from '../../domain/positive_integer_policy';

type CardRequest = Omit<BugbotStatusCardWakeup, 'dryRun'> & (
    | { readonly kind: 'progress' }
    | { readonly kind: 'analysis-result' | 'state-refresh'; readonly verifiedBody: string }
);

const maxHandoffBytes = 64_000;
const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

function hasKeys(value: Record<string, unknown>, ...keys: readonly string[]): boolean {
    const actual = Object.keys(value);
    return keys.length === actual.length && actual.every(key => keys.includes(key));
}

/** The worker separately authenticates the actor, origin workflow and current comparison. */
export function decodeGithubBugbotStatusCardHandoff(input: { pullNumber: unknown; work: unknown }): CardRequest | undefined {
    if (typeof input.work !== 'string' || Buffer.byteLength(input.work, 'utf8') > maxHandoffBytes) return undefined;
    let value: unknown;
    try { value = JSON.parse(input.work); }
    catch { return undefined; }
    if (!isObject(value) || value.version !== 1 || !isObject(value.source)) return undefined;
    const { source, kind, verifiedBody } = value;
    if (kind !== 'progress' && kind !== 'analysis-result' && kind !== 'state-refresh') return undefined;
    const fields = ['version', 'source', 'runId', 'attempt', 'kind'];
    if (!hasKeys(value, ...(kind === 'progress' ? fields : [...fields, 'verifiedBody']))) return undefined;
    if (!hasKeys(source, 'repositoryId', 'pullNumber', 'base', 'baseRef', 'head', 'policy')
        || typeof source.repositoryId !== 'number' || typeof source.pullNumber !== 'number'
        || typeof source.base !== 'string' || typeof source.baseRef !== 'string' || typeof source.head !== 'string'
        || typeof source.policy !== 'string') return undefined;
    const { repositoryId, pullNumber, base, baseRef, head, policy } = source;
    const identity = { repositoryId, pullNumber, base, baseRef, head, policy };
    const runId = parsePositiveSafeInteger(value.runId);
    const attempt = parsePositiveSafeInteger(value.attempt);
    if (!isBugbotStatusCardSource(identity) || parsePositiveSafeInteger(input.pullNumber) !== pullNumber
        || !runId || !attempt || value.runId !== runId || value.attempt !== attempt) return undefined;
    if (kind === 'progress') return { kind, source: identity, runId, attempt };
    if (typeof verifiedBody !== 'string' || readBugbotStatusCardHead(verifiedBody, pullNumber) !== head) return undefined;
    return { kind, source: identity, runId, attempt, verifiedBody };
}

export function encodeGithubBugbotStatusCardHandoff(request: CardRequest): { pull_number: string; work: string } | undefined {
    const { pullNumber } = request.source;
    const work = JSON.stringify({ version: 1, ...request });
    return decodeGithubBugbotStatusCardHandoff({ pullNumber, work }) ? { pull_number: String(pullNumber), work } : undefined;
}

/** A correlation key binds bytes; the worker still validates publication authority. */
export function githubBugbotStatusCardOperation(work: string, sequence?: number): string {
    if (sequence !== undefined && (!Number.isSafeInteger(sequence) || sequence < 0)) throw new Error('Invalid progress correlation sequence.');
    return (sequence === undefined ? '' : String(sequence) + ':') + createHash('sha256').update(work).digest('hex');
}
