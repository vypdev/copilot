import type { BugbotReviewProgressObservation } from '../ports/bugbot_review_progress_ports';
import { canonicalGitObjectId } from '../../domain/git_object_id';

const markerPrefix = '<!-- copilot-bugbot-progress:v1 ';
const marker = /<!-- copilot-bugbot-progress:v1 ([A-Za-z0-9_-]{1,3000}) -->/gu;
const stages = ['preparing', 'analyzing', 'verifying', 'publishing', 'finished'] as const;
const outcomes = ['completed', 'no-findings', 'partial', 'dry-run', 'superseded', 'skipped', 'failed'] as const;
const observationKeys = ['stage', 'headSha', 'baseSha', 'baseRefSha', 'pullNumber', 'elapsedMs', 'observedAt', 'sequence',
    'partitions', 'frames', 'candidates', 'retries', 'stageTimesMs', 'failureCode', 'outcome'];
const attemptKey = /^bugbot:([1-9]\d{0,15}):([a-f0-9]{40}|[a-f0-9]{64}):([a-f0-9]{40}|[a-f0-9]{64}):(?:default|[a-f0-9]{64}):([1-9]\d{0,15}):([1-9]\d{0,15})$/u;

const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => nonnegative(value) && value > 0;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const allowed = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));

function count(value: unknown, key: 'completed' | 'ordinal'): boolean {
    return record(value) && allowed(value, [key, 'total']) && nonnegative(value.total)
        && (key === 'completed' ? nonnegative(value[key]) : positive(value[key]))
        && Number(value[key]) <= value.total;
}

function validObservation(value: unknown, externalId: string): value is BugbotReviewProgressObservation {
    const identity = attemptKey.exec(externalId);
    if (!identity || [identity[1], identity[4], identity[5]].some(item => !positive(Number(item)))
        || !record(value) || !allowed(value, observationKeys)) return false;
    const { stage, outcome, observedAt, elapsedMs, sequence, partitions, frames, candidates, retries, failureCode, stageTimesMs } = value;
    return value.pullNumber === Number(identity[1]) && value.baseSha === identity[2] && value.headSha === identity[3]
        && canonicalGitObjectId(value.baseSha) === value.baseSha && canonicalGitObjectId(value.headSha) === value.headSha
        && (value.baseRefSha === undefined || canonicalGitObjectId(value.baseRefSha) === value.baseRefSha)
        && stages.includes(stage as typeof stages[number])
        && (stage === 'finished' ? outcomes.includes(outcome as typeof outcomes[number]) : outcome === undefined)
        && typeof observedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(observedAt)
        && Number.isFinite(Date.parse(observedAt)) && new Date(observedAt).toISOString() === observedAt
        && nonnegative(elapsedMs) && positive(sequence)
        && (partitions === undefined || count(partitions, 'completed'))
        && (frames === undefined || count(frames, 'ordinal'))
        && (candidates === undefined || count(candidates, 'completed'))
        && (retries === undefined || nonnegative(retries))
        && (stageTimesMs === undefined || (record(stageTimesMs) && allowed(stageTimesMs, stages.slice(0, -1))
            && Object.values(stageTimesMs).every(nonnegative)))
        && (failureCode === undefined || (typeof failureCode === 'string' && failureCode.length <= 64
            && /^[a-z]+(?:[.-][a-z]+)*$/u.test(failureCode)));
}

export function buildBugbotProgressCheckMarker(observation: BugbotReviewProgressObservation, externalId: string): string | undefined {
    if (!validObservation(observation, externalId)) return undefined;
    const encoded = Buffer.from(JSON.stringify({ externalId, observation }), 'utf8').toString('base64url');
    return `${markerPrefix}${encoded} -->`;
}

/** The caller authenticates the native check and its attempt before supplying the external ID. */
export function readBugbotProgressCheckObservation(summary: string, externalId: string): BugbotReviewProgressObservation | undefined {
    if (summary.length > 20_000 || summary.split(markerPrefix).length !== 2) return undefined;
    const matches = [...summary.matchAll(marker)];
    if (matches.length !== 1) return undefined;
    try {
        const encoded = matches[0][1];
        const bytes = Buffer.from(encoded, 'base64url');
        if (bytes.toString('base64url') !== encoded) return undefined;
        const payload: unknown = JSON.parse(bytes.toString('utf8'));
        if (!record(payload) || !allowed(payload, ['externalId', 'observation']) || payload.externalId !== externalId
            || !validObservation(payload.observation, externalId)) return undefined;
        return payload.observation;
    } catch {
        return undefined;
    }
}
