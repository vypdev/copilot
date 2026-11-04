import { isProgressEvidencePath } from './progress_evidence_path';
import { isProgressSourceLineId } from './progress_response_diagnostic';

export type ProgressCapacityPhase = 'input' | 'source' | 'scope' | 'partition' | 'aggregate' | 'assessment';
export type ProgressCapacityUnit = 'bytes' | 'parts' | 'lines' | 'code-points' | 'units';
export type ProgressCapacityBound = 'minimum' | 'maximum' | 'unavailable';
export type ProgressCapacityCount = number | 'unavailable';
const rule = (phases: readonly ProgressCapacityPhase[], unit: ProgressCapacityUnit, bounds: readonly ProgressCapacityBound[] = ['maximum']) =>
    Object.freeze({ phases: Object.freeze([...phases]), unit, bounds: Object.freeze([...bounds]) });
export const PROGRESS_CAPACITY_DIMENSIONS = Object.freeze({
    'source-unit-bytes': rule(['source'], 'bytes'),
    'source-part-bytes': rule(['source'], 'bytes'),
    'source-part-count': rule(['source'], 'parts'),
    'source-unit-count': rule(['source'], 'units'),
    'source-manifest-bytes': rule(['source'], 'bytes'),
    'source-line-count': rule(['scope'], 'lines', ['minimum', 'maximum']),
    'source-line-points': rule(['scope'], 'code-points'),
    'input-text-bytes': rule(['input', 'scope', 'partition', 'assessment'], 'bytes'),
    'native-prompt-bytes': rule(['input', 'scope', 'partition', 'assessment'], 'bytes'),
    'native-prompt-reserve-bytes': rule(['partition', 'assessment'], 'bytes'),
    'aggregate-reserve-bytes': rule(['aggregate'], 'bytes'),
    'aggregate-allocation-bytes': rule(['aggregate'], 'bytes', ['minimum', 'maximum']),
    'aggregate-envelope-bytes': rule(['aggregate'], 'bytes'),
    'minimum-fact-bytes': rule(['aggregate'], 'bytes'),
    'evidence-unit-count': rule(['aggregate'], 'units', ['minimum']),
    'aggregate-fact-bytes': rule(['aggregate'], 'bytes'),
    'invalid-allocation': rule(['input', 'source', 'scope', 'partition', 'aggregate', 'assessment'], 'bytes', ['unavailable']),
});
export type ProgressCapacityDimension = keyof typeof PROGRESS_CAPACITY_DIMENSIONS;
export type ProgressCapacityContext =
    | Readonly<{ kind: 'unavailable' }>
    | Readonly<{ kind: 'source-line'; sourceLineId: string }>
    | Readonly<{
        kind: 'comparison'; baseSha: string; headSha: string; manifestDigest: string; sourceLineId: string;
        requiredPathsDigest: string; reviewedPathsDigest: string; uncoveredPathsDigest: string;
        requiredPathCount: number; reviewedPathCount: number;
        uncoveredPathCount: number; paths: readonly string[];
    }>;
export interface ProgressCapacityDiagnostic {
    readonly phase: ProgressCapacityPhase;
    readonly dimension: ProgressCapacityDimension;
    readonly unit: ProgressCapacityUnit;
    readonly bound: ProgressCapacityBound;
    readonly observedCount: ProgressCapacityCount;
    readonly supportedLimit: ProgressCapacityCount;
    readonly countKind: 'exact' | 'at-least' | 'unavailable';
    readonly context: ProgressCapacityContext;
}
export interface ProgressCapacityInput {
    readonly phase: ProgressCapacityPhase;
    readonly dimension: ProgressCapacityDimension;
    readonly observedCount: ProgressCapacityCount;
    readonly supportedLimit: ProgressCapacityCount;
    readonly bound?: ProgressCapacityBound;
    readonly countKind?: ProgressCapacityDiagnostic['countKind'];
    readonly context?: ProgressCapacityContext;
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: object, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const measured = (value: unknown): value is ProgressCapacityCount => value === 'unavailable' || count(value);
const oid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$(?![\s\S])/u.test(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$(?![\s\S])/u.test(value);
function invalid(): never { throw new TypeError('Invalid closed progress capacity diagnostic.'); }

/** Shape validation does not certify a source; host call sites own attribution. */
export function normalizeProgressCapacityContext(value: unknown): ProgressCapacityContext {
    if (!record(value)) return invalid();
    if (value.kind === 'unavailable') {
        if (!exact(value, ['kind'])) return invalid();
        return Object.freeze({ kind: 'unavailable' });
    }
    if (value.kind === 'source-line') {
        if (!exact(value, ['kind', 'sourceLineId']) || !isProgressSourceLineId(value.sourceLineId)) return invalid();
        return Object.freeze({ kind: 'source-line', sourceLineId: value.sourceLineId });
    }
    if (value.kind !== 'comparison' || !exact(value, ['kind', 'baseSha', 'headSha', 'manifestDigest', 'requiredPathsDigest',
        'reviewedPathsDigest', 'uncoveredPathsDigest', 'requiredPathCount', 'reviewedPathCount', 'uncoveredPathCount', 'paths', 'sourceLineId'])
        || !oid(value.baseSha) || !oid(value.headSha) || !(value.manifestDigest === 'none' || digest(value.manifestDigest))
        || !digest(value.requiredPathsDigest) || !digest(value.reviewedPathsDigest) || !digest(value.uncoveredPathsDigest)
        || !(value.sourceLineId === 'none' || isProgressSourceLineId(value.sourceLineId))
        || !count(value.requiredPathCount) || !count(value.reviewedPathCount)
        || !count(value.uncoveredPathCount) || value.reviewedPathCount > value.requiredPathCount
        || value.uncoveredPathCount !== value.requiredPathCount - value.reviewedPathCount
        || !Array.isArray(value.paths) || value.paths.length > Math.min(8, value.uncoveredPathCount)
        || (value.uncoveredPathCount > 0 && value.paths.length === 0)
        || !value.paths.every(isProgressEvidencePath) || new Set(value.paths).size !== value.paths.length
        || Buffer.byteLength(JSON.stringify(value.paths), 'utf8') > 8_192) return invalid();
    return Object.freeze({ kind: 'comparison', baseSha: value.baseSha, headSha: value.headSha,
        manifestDigest: value.manifestDigest, sourceLineId: value.sourceLineId, requiredPathsDigest: value.requiredPathsDigest,
        reviewedPathsDigest: value.reviewedPathsDigest, uncoveredPathsDigest: value.uncoveredPathsDigest,
        requiredPathCount: value.requiredPathCount, reviewedPathCount: value.reviewedPathCount,
        uncoveredPathCount: value.uncoveredPathCount, paths: Object.freeze([...value.paths] as string[]) });
}

/** Reject incoherent or arbitrary metadata and copy/freeze the complete public value. */
export function normalizeProgressCapacityDiagnostic(value: unknown): ProgressCapacityDiagnostic {
    if (!record(value) || !exact(value, ['phase', 'dimension', 'unit', 'bound', 'observedCount', 'supportedLimit', 'countKind', 'context'])
        || typeof value.dimension !== 'string' || !own(PROGRESS_CAPACITY_DIMENSIONS, value.dimension)) return invalid();
    const dimension = value.dimension as ProgressCapacityDimension;
    const policy = PROGRESS_CAPACITY_DIMENSIONS[dimension];
    if (!policy.phases.includes(value.phase as ProgressCapacityPhase) || value.unit !== policy.unit
        || !policy.bounds.includes(value.bound as ProgressCapacityBound)
        || !measured(value.observedCount) || !measured(value.supportedLimit)
        || !['exact', 'at-least', 'unavailable'].includes(value.countKind as string)
        || (value.observedCount === 'unavailable') !== (value.countKind === 'unavailable')
        || (value.bound === 'unavailable' && (value.observedCount !== 'unavailable' || value.supportedLimit !== 'unavailable'))
        || (value.bound === 'minimum' && value.countKind === 'at-least')) return invalid();
    if (typeof value.observedCount === 'number' && typeof value.supportedLimit === 'number'
        && (value.bound === 'minimum' ? value.observedCount >= value.supportedLimit : value.observedCount <= value.supportedLimit)) return invalid();
    const context = normalizeProgressCapacityContext(value.context);
    const sourceLineId = context.kind === 'source-line' || context.kind === 'comparison' ? context.sourceLineId : 'none';
    if (sourceLineId !== 'none' && (value.phase !== 'scope'
        || !['source-line-count', 'source-line-points'].includes(dimension))) return invalid();
    return Object.freeze({ phase: value.phase as ProgressCapacityPhase, dimension, unit: policy.unit,
        bound: value.bound as ProgressCapacityBound, observedCount: value.observedCount, supportedLimit: value.supportedLimit,
        countKind: value.countKind as ProgressCapacityDiagnostic['countKind'], context });
}

/** Unit/bound defaults are host policy, never text supplied by a model. */
export function progressCapacityDiagnostic(input: ProgressCapacityInput): ProgressCapacityDiagnostic {
    if (!record(input) || !['phase', 'dimension', 'observedCount', 'supportedLimit'].every(key => own(input, key))
        || Object.keys(input).some(key => !['phase', 'dimension', 'observedCount', 'supportedLimit', 'bound', 'countKind', 'context'].includes(key))) return invalid();
    const policy = PROGRESS_CAPACITY_DIMENSIONS[input.dimension];
    return normalizeProgressCapacityDiagnostic({ phase: input.phase, dimension: input.dimension, unit: policy?.unit,
        bound: input.bound ?? 'maximum', observedCount: input.observedCount, supportedLimit: input.supportedLimit,
        countKind: input.countKind ?? 'exact', context: input.context ?? { kind: 'unavailable' } });
}
