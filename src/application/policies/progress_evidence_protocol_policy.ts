import { createHash } from 'node:crypto';
import { ApplicationError } from '../errors/application_error';
import type { ProgressDiffChange, ProgressDiffEvidence, ProgressDiffPartition, ProgressEvidenceProtocol, ProgressRecoveryUsage } from '../ports/progress_diff_query_ports';
import { isProgressEvidencePath } from '../../domain/progress_evidence_path';
import { MAX_PROGRESS_EVIDENCE_BYTES, MAX_FRAMED_PROGRESS_PARTITIONS, progressEvidenceTooLarge } from './progress_diff_partition_policy';
import { MAX_PROGRESS_EVIDENCE_UNITS } from './progress_content_evidence_policy';
import { MAX_PROGRESS_RECOVERY_FRAMES, PROGRESS_RECOVERY_FRAME_LIMITS, PROGRESS_RECOVERY_TOTAL_LIMITS } from './progress_recovery_capacity_policy';

type Partitioned = Extract<ProgressDiffEvidence, { kind: 'partitioned' }>;
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const oid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: object, keys: readonly string[]): boolean => same(Object.keys(value).sort(), [...keys].sort());

export type ProgressProtocolFailure = 'source-part-json' | 'source-part-identity' | 'source-part-paths' | 'source-part-units' | 'source-manifest-identity' | 'source-part-count' | 'source-part-digest' | 'source-coverage' | 'source-manifest-digest' | 'source-part-shape' | 'response-inventory' | 'response-identity';

export function progressProtocolRejected(reason: ProgressProtocolFailure): ApplicationError {
    return new ApplicationError(reason.startsWith('response-') ? 'agent.failed' : 'validation.evidence-unavailable', `Complete progress evidence protocol was rejected (${reason}). Existing progress was retained; rerun the current source to collect a fresh complete attempt.`);
}
function invalid(reason: ProgressProtocolFailure): never { throw progressProtocolRejected(reason); }

function validUsage(usage: unknown): usage is ProgressRecoveryUsage | null {
    if (usage === null) return true;
    if (!record(usage) || !exact(usage, ['frames', 'current', 'total']) || !Number.isSafeInteger(usage.frames)
        || (usage.frames as number) < 1 || (usage.frames as number) > MAX_PROGRESS_RECOVERY_FRAMES) return false;
    const keys = Object.keys(PROGRESS_RECOVERY_FRAME_LIMITS) as (keyof typeof PROGRESS_RECOVERY_FRAME_LIMITS)[];
    const { current, total } = usage;
    return record(current) && record(total) && exact(current, keys) && exact(total, keys) && keys.every(key =>
        Number.isSafeInteger(current[key]) && Number.isSafeInteger(total[key]) && (current[key] as number) >= 0
        && (current[key] as number) <= PROGRESS_RECOVERY_FRAME_LIMITS[key]
        && (total[key] as number) >= (current[key] as number)
        && (total[key] as number) <= PROGRESS_RECOVERY_TOTAL_LIMITS[key]
        && (total[key] as number) <= (usage.frames as number) * PROGRESS_RECOVERY_FRAME_LIMITS[key]);
}

function partChanges(part: ProgressDiffPartition, baseSha: string, headSha: string): ProgressDiffChange[] {
    let value: unknown;
    try { value = JSON.parse(part.evidence); } catch { return invalid('source-part-json'); }
    if (!record(value) || !exact(value, ['kind', 'baseSha', 'headSha', 'changes']) || value.kind !== 'pinned-branch-comparison'
        || value.baseSha !== baseSha || value.headSha !== headSha || !Array.isArray(value.changes) || value.changes.length === 0
        || value.changes.some(change => !record(change) || !isProgressEvidencePath(change.path)
            || (change.unitId !== undefined && (typeof change.unitId !== 'string' || change.unitId.length === 0 || change.unitId.length > 100)))) invalid('source-part-identity');
    const changes = value.changes as ProgressDiffChange[];
    const paths = [...new Set(changes.map(change => change.path))];
    if (!same(part.paths, paths)) invalid('source-part-paths');
    const units = changes.map(change => ({ id: change.unitId, path: change.path,
        ...(change.recoveredContent ? { content: Object.fromEntries(Object.entries(change.recoveredContent).filter(([key]) => key !== 'text')) } : {}) }));
    if (part.units ? !same(part.units, units) : changes.some(change => change.unitId !== undefined)) invalid('source-part-units');
    return changes;
}
function partDigest(baseSha: string, headSha: string, preimageSha: string, part: ProgressDiffPartition, ordinal: number, total: number): string {
    return hash({ version: 'progress-source-part-v1', baseSha, headSha, preimageSha, ordinal, total,
        paths: part.paths, units: part.units ?? null, evidence: part.evidence });
}
function manifestBody(diff: Partitioned, protocol: ProgressEvidenceProtocol): object {
    return { kind: 'framed-branch-comparison-v1', baseSha: diff.baseSha, headSha: diff.headSha,
        version: protocol.version, attemptId: protocol.attemptId, preimageSha: protocol.preimageSha,
        sourcesDigest: protocol.sourcesDigest, requiredPaths: protocol.requiredPaths, unitCount: protocol.unitCount, recovery: protocol.recovery,
        partitions: diff.partitions.map(part => ({ sourceIdentity: part.sourceIdentity, paths: part.paths, units: part.units ?? null })) };
}
function requestId(manifestDigest: string, sourceDigest: string, contextDigest: string): string {
    return 'progress-request-' + hash({ version: 'progress-request-v1', manifestDigest, sourceDigest, contextDigest });
}

/** Independent source/manifest verification, both before analysis and at aggregation. */
export function validateFramedProgressEvidence(diff: Partitioned, bound = false): void {
    const protocol = diff.protocol;
    if (!record(protocol) || !exact(protocol, ['version', 'attemptId', 'preimageSha', 'sourcesDigest', 'manifestDigest', 'requiredPaths', 'unitCount', 'recovery', ...(bound ? ['assessmentContextDigest'] : [])])
        || protocol.version !== 'framed-v1' || !uuid(protocol.attemptId) || !oid(diff.baseSha) || !oid(diff.headSha)
        || !oid(protocol.preimageSha) || !digest(protocol.sourcesDigest) || !digest(protocol.manifestDigest)
        || !validUsage(protocol.recovery) || !Array.isArray(protocol.requiredPaths) || protocol.requiredPaths.length === 0 || protocol.requiredPaths.length >= 300
        || protocol.requiredPaths.some(path => !isProgressEvidencePath(path)) || new Set(protocol.requiredPaths).size !== protocol.requiredPaths.length
        || !Number.isSafeInteger(protocol.unitCount) || protocol.unitCount < 1 || protocol.unitCount > MAX_PROGRESS_EVIDENCE_UNITS
        || (bound && !digest(protocol.assessmentContextDigest))) invalid('source-manifest-identity');
    if (!Array.isArray(diff.partitions) || diff.partitions.length < 1 || diff.partitions.length > MAX_FRAMED_PROGRESS_PARTITIONS) invalid('source-part-count');
    const all: ProgressDiffChange[] = [];
    for (const [index, part] of diff.partitions.entries()) {
        if (part === null || typeof part !== 'object' || typeof part.evidence !== 'string') invalid('source-part-shape');
        if (Buffer.byteLength(part.evidence) > MAX_PROGRESS_EVIDENCE_BYTES) throw progressEvidenceTooLarge();
        const identity = part.sourceIdentity;
        const expected = partDigest(diff.baseSha, diff.headSha, protocol.preimageSha, part, index + 1, diff.partitions.length);
        const sourceId = `progress-source-${index + 1}-of-${diff.partitions.length}-${expected}`;
        if (!identity || !exact(identity, ['id', 'digest', 'ordinal', 'total']) || identity.id !== sourceId || identity.digest !== expected
            || identity.ordinal !== index + 1 || identity.total !== diff.partitions.length
            || part.id !== (bound ? requestId(protocol.manifestDigest, identity.digest, protocol.assessmentContextDigest!) : sourceId)) invalid('source-part-digest');
        all.push(...partChanges(part, diff.baseSha, diff.headSha));
    }
    const ids = all.map(change => change.unitId ?? change.path);
    const paths = new Set(all.map(change => change.path));
    if (all.length !== protocol.unitCount || new Set(ids).size !== all.length || hash(all) !== protocol.sourcesDigest
        || paths.size !== protocol.requiredPaths.length || protocol.requiredPaths.some(path => !paths.has(path))) invalid('source-coverage');
    const body = manifestBody(diff, protocol);
    if (hash(body) !== protocol.manifestDigest || diff.evidence !== JSON.stringify({ ...body, manifestDigest: protocol.manifestDigest })) invalid('source-manifest-digest');
    if (Buffer.byteLength(diff.evidence) > MAX_PROGRESS_EVIDENCE_BYTES) throw progressEvidenceTooLarge();
}

/** The data adapter supplies the complete independent inventory and fresh host UUID. */
export function frameProgressEvidence(diff: Partitioned, preimageSha: string, complete: readonly ProgressDiffChange[], requiredPaths: readonly string[],
    recovery: ProgressRecoveryUsage | undefined, attemptId: string): Partitioned {
    const partitions = Object.freeze(diff.partitions.map((part, index) => {
        const sourceDigest = partDigest(diff.baseSha, diff.headSha, preimageSha, part, index + 1, diff.partitions.length);
        const id = `progress-source-${index + 1}-of-${diff.partitions.length}-${sourceDigest}`;
        return Object.freeze({ ...part, id, sourceIdentity: Object.freeze({ id, digest: sourceDigest, ordinal: index + 1, total: diff.partitions.length }) });
    }));
    const initial = { version: 'framed-v1' as const, attemptId, preimageSha, sourcesDigest: hash(complete), requiredPaths: Object.freeze([...requiredPaths]),
        unitCount: complete.length, recovery: recovery ?? null, manifestDigest: '' };
    const manifest = manifestBody({ ...diff, partitions }, initial);
    const manifestDigest = hash(manifest);
    const result: Partitioned = Object.freeze({ ...diff, partitions, protocol: Object.freeze({ ...initial, manifestDigest }), evidence: JSON.stringify({ ...manifest, manifestDigest }) });
    validateFramedProgressEvidence(result);
    return result;
}

/** Fixed-size IDs bind source, attempt, full issue, extracted scope and locale. */
export function bindProgressEvidence(diff: ProgressDiffEvidence, issue: string, acceptanceScope: string, locale: string): ProgressDiffEvidence {
    if (diff.kind !== 'partitioned' || !diff.protocol) return diff;
    validateFramedProgressEvidence(diff);
    const contextDigest = hash({ issue, acceptanceScope, locale });
    const protocol = Object.freeze({ ...diff.protocol, assessmentContextDigest: contextDigest });
    const result: Partitioned = Object.freeze({ ...diff, protocol, partitions: Object.freeze(diff.partitions.map(part => Object.freeze({ ...part,
        id: requestId(protocol.manifestDigest, part.sourceIdentity!.digest, contextDigest) }))) });
    validateFramedProgressEvidence(result, true);
    return result;
}
