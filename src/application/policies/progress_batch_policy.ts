import type { ProgressScopeSource } from './progress_scope_source_policy';
import { progressBatchRejected } from './progress_batch_rejection_policy';
export { progressBatchRejected } from './progress_batch_rejection_policy';
import { createHash } from 'node:crypto';
import type { ProgressBatchReason } from '../../domain/progress_batch_diagnostic';
import type { ProgressDiffEvidence } from '../ports/progress_diff_query_ports';
import type { ProgressComparisonSource } from '../ports/progress_comparison_source_ports';
import type { ProgressScope, ProgressScopeAnchors } from './progress_scope_policy';
import { scopedProgressResponseSchema, parseScopedProgressResponse, progressScopeResponseSchema, parseProgressScopeClassifications } from './progress_scope_policy';
import { progressResponsePayload } from './progress_response_rejection_policy';
import { validateFramedProgressEvidence } from './progress_evidence_protocol_policy';
import { isProgressEvidencePath } from '../../domain/progress_evidence_path';
import { MAX_PROGRESS_ASSESSMENT_POINTS, progressAssessmentFactLimit } from './progress_assessment_capacity_policy';
import { ProgressCapacityFailure } from '../errors/progress_capacity_failure';
import { ProgressCompletionMismatch } from '../errors/progress_completion_mismatch';
import { ApplicationError } from '../errors/application_error';
import { progressCitationRepetitionError } from './progress_citation_recovery_policy';

export const PROGRESS_BATCH_PROFILE = Object.freeze({ sourceLines: 32, clauses: 256, bytes: 262_144,
    assessmentClauses: 32, calls: 120, milliseconds: 1_800_000 });
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
function freezeSnapshot<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freezeSnapshot);
    }
    return value;
}

export function progressGroups<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
    if (!Number.isSafeInteger(size) || size < 1 || size > 32) throw progressBatchRejected('scope-capacity');
    const groups: T[][] = [];
    for (let offset = 0; offset < items.length; offset += size) groups.push(items.slice(offset, offset + size));
    return Object.freeze(groups.map(group => Object.freeze(group)));
}
interface ProgressScopeIdentity {
    readonly repository: string;
    readonly issueNumber: number;
    readonly issueDescription: string;
    readonly comparisonSource: ProgressComparisonSource;
    readonly baseSha: string;
    readonly headSha: string;
}
export function progressScopeSnapshotDigest(identity: ProgressScopeIdentity, source: ProgressScopeSource): string {
    const { repository, issueNumber, issueDescription, comparisonSource, baseSha, headSha } = identity;
    return digest({ version: 'progress-scope-source-v1', repository, issueNumber, comparisonSource, baseSha, headSha,
        issueDigest: createHash('sha256').update(issueDescription).digest('hex'), lines: source.lines,
        totalLines: source.totalLines, operationalLines: source.operationalLines,
        draft: source.draft ? { publication: source.draft.publication, required: [...source.draft.required], evidence: [...source.draft.evidence] } : null });
}
export function progressClassificationBinding(snapshotDigest: string, lines: ProgressScopeSource['lines'], headSha: string, ordinal: number) {
    return Object.freeze({ snapshotDigest, assignmentId: 'C' + digest({ snapshotDigest, ids: lines.map(line => line.id) }), headSha, ordinal });
}
type ClassificationBinding = ReturnType<typeof progressClassificationBinding>;
export function progressClassificationResponseSchema(source: ProgressScopeSource, binding: ClassificationBinding) {
    const schema = progressScopeResponseSchema(source.lines, source.draft?.required);
    return { ...schema, properties: { ...schema.properties, snapshotDigest: { type: 'string', enum: [binding.snapshotDigest] },
        assignmentId: { type: 'string', enum: [binding.assignmentId] }, headSha: { type: 'string', enum: [binding.headSha] } },
        required: [...schema.required, 'snapshotDigest', 'assignmentId', 'headSha'] };
}
export function parseProgressClassificationReceipt(response: unknown, source: ProgressScopeSource, locale: string, binding: ClassificationBinding) {
    const payload = progressResponsePayload(response, locale, 'scope');
    if (!exact(payload, ['outputLocale', 'lines', 'snapshotDigest', 'assignmentId', 'headSha'])
        || payload.snapshotDigest !== binding.snapshotDigest || payload.headSha !== binding.headSha) throw progressBatchRejected('manifest-identity', { batch: binding.ordinal });
    if (payload.assignmentId !== binding.assignmentId) throw progressBatchRejected('batch-identity', { batch: binding.ordinal });
    return parseProgressScopeClassifications({ outputLocale: payload.outputLocale, lines: payload.lines }, source, locale);
}
export interface ProgressEvidenceReference { readonly id: string; readonly path: string; readonly unitId?: string; readonly headSha: string; readonly generated: boolean }
export interface ProgressScopeManifest {
    readonly version: 'progress-scope-batches-v1';
    readonly repository: string;
    readonly issueNumber: number;
    readonly issueDigest: string;
    readonly comparisonSource: ProgressComparisonSource;
    readonly baseSha: string;
    readonly headSha: string;
    readonly scope: ProgressScope;
    readonly evidence: readonly ProgressEvidenceReference[];
    readonly evidenceDigest: string;
    readonly sourceInventory: { readonly snapshotDigest: string; readonly totalLines: number; readonly operationalLines: number; readonly classifications: ReturnType<typeof parseProgressScopeClassifications> };
    readonly digest: string;
}
/** Native source identities admit evidence. Model echoes cannot create an evidence reference. */
export function progressEvidenceReferences(diff: ProgressDiffEvidence): readonly ProgressEvidenceReference[] {
    if (diff.kind === 'partitioned' && diff.protocol) validateFramedProgressEvidence(diff);
    const parts = diff.kind === 'partitioned' ? diff.partitions.map(part => part.evidence) : [diff.evidence];
    const references: ProgressEvidenceReference[] = [];
    for (const part of parts) {
        let payload: unknown;
        try { payload = JSON.parse(part); } catch { throw progressBatchRejected('evidence-identity'); }
        if (!record(payload) || payload.baseSha !== diff.baseSha || payload.headSha !== diff.headSha || !Array.isArray(payload.changes)) throw progressBatchRejected('evidence-identity');
        for (const change of payload.changes) {
            if (!record(change) || !isProgressEvidencePath(change.path)) throw progressBatchRejected('evidence-identity');
            const id = typeof change.unitId === 'string' ? change.unitId : change.path;
            references.push(Object.freeze({ id, path: change.path, ...(typeof change.unitId === 'string' ? { unitId: change.unitId } : {}), headSha: diff.headSha, generated: change.evidence === 'generated-metadata-only' }));
        }
    }
    if (!references.some(reference => !reference.generated) || new Set(references.map(reference => reference.id)).size !== references.length) throw progressBatchRejected('evidence-missing');
    return Object.freeze(references);
}
export function createProgressScopeManifest(input: Omit<ProgressScopeManifest, 'version' | 'digest' | 'issueDigest' | 'evidence' | 'evidenceDigest' | 'sourceInventory'> & { issueDescription: string; capturedSource: ProgressScopeSource; classifications: ReturnType<typeof parseProgressScopeClassifications> }, diff: ProgressDiffEvidence): ProgressScopeManifest {
    const { issueDescription, capturedSource, classifications, ...identity } = input;
    if (!/^[^/\s]+\/[^/\s]+$/u.test(input.repository) || !Number.isSafeInteger(input.issueNumber) || input.issueNumber < 1
        || ![input.baseSha, input.headSha].every(sha => /^[a-f0-9]{40}$/u.test(sha))
        || input.baseSha !== diff.baseSha || input.headSha !== diff.headSha) throw progressBatchRejected('manifest-identity');
    // Revalidate locale-independent host facts before assigning their canonical source order.
    const classified = new Map(parseProgressScopeClassifications({ outputLocale: 'en-US', lines: classifications }, capturedSource, 'en-US').map(entry => [entry.id, entry]));
    const orderedClassifications = capturedSource.lines.map(line => classified.get(line.id)!);
    const body = { version: 'progress-scope-batches-v1' as const, ...identity,
        issueDigest: createHash('sha256').update(issueDescription).digest('hex'), evidence: progressEvidenceReferences(diff),
        evidenceDigest: digest(diff.kind === 'partitioned' ? diff.partitions.map(part => JSON.parse(part.evidence)) : JSON.parse(diff.evidence)),
        sourceInventory: { snapshotDigest: progressScopeSnapshotDigest(input, capturedSource), totalLines: capturedSource.totalLines, operationalLines: capturedSource.operationalLines, classifications: orderedClassifications } };
    const { evidence: _evidence, ...scopeManifest } = body;
    if (Buffer.byteLength(JSON.stringify(scopeManifest), 'utf8') > PROGRESS_BATCH_PROFILE.bytes) throw progressBatchRejected('aggregate-capacity');
    return freezeSnapshot(structuredClone({ ...body, digest: digest(body) }));
}
export interface ProgressAssessmentBatch { readonly id: string; readonly ordinal: number; readonly scope: ProgressScope }
export function planProgressAssessmentBatches(manifest: ProgressScopeManifest, size: number = PROGRESS_BATCH_PROFILE.assessmentClauses): readonly ProgressAssessmentBatch[] {
    const { digest: manifestDigest, ...body } = manifest;
    if (digest(body) !== manifestDigest) throw progressBatchRejected('manifest-identity');
    if (!manifest.scope.requirements.length || manifest.scope.requirements.length > PROGRESS_BATCH_PROFILE.clauses
        || manifest.scope.exclusions.length > PROGRESS_BATCH_PROFILE.clauses) throw progressBatchRejected('scope-capacity');
    return Object.freeze(progressGroups(manifest.scope.requirements, size).map((requirements, index) => {
        const scope = Object.freeze({ ...manifest.scope, requirements });
        return Object.freeze({ ordinal: index + 1, id: 'B' + digest({ manifest: manifest.digest, ids: requirements.map(requirement => requirement.id) }), scope });
    }));
}
export function progressBatchDisplayScope(batch: ProgressAssessmentBatch, compact: boolean): ProgressScope {
    return compact ? { ...batch.scope, requirements: batch.scope.requirements.map(requirement => {
        const source = requirement.sources![0];
        return { ...requirement, quote: (source.origin === 'draft' ? 'SDD ' : '') + source.id };
    }) } : batch.scope;
}
/** One hard allocation reserves every source reference, separator and nonempty fact. */
function aggregateFactLimit(manifest: ProgressScopeManifest, compact: boolean, anchors: ProgressScopeAnchors): number {
    const display = progressBatchDisplayScope({ id: '', ordinal: 0, scope: manifest.scope }, compact);
    return progressAssessmentFactLimit(display.requirements, anchors);
}
export function progressBatchResponseSchema(manifest: ProgressScopeManifest, batch: ProgressAssessmentBatch, anchors: ProgressScopeAnchors, compact: boolean) {
    const schema = scopedProgressResponseSchema(progressBatchDisplayScope(batch, compact), anchors);
    const factLimit = aggregateFactLimit(manifest, compact, anchors);
    const description = `Each fact has a hard ${factLimit}-Unicode-code-point aggregate allocation. Use one short factual phrase. Each complete publication field has 8000 points shared across all ${manifest.scope.requirements.length} requirements.`;
    return { ...schema, properties: { ...schema.properties,
        manifestDigest: { type: 'string', enum: [manifest.digest] }, batchId: { type: 'string', enum: [batch.id] },
        headSha: { type: 'string', enum: [manifest.headSha] },
        requirements: { ...schema.properties.requirements, items: { ...schema.properties.requirements.items,
            properties: { ...schema.properties.requirements.items.properties,
                summary: { ...schema.properties.requirements.items.properties.summary, maxLength: factLimit, description },
                remaining: { ...schema.properties.requirements.items.properties.remaining, maxLength: factLimit, description },
                citations: { type: 'array', minItems: 1, maxItems: 8, description: 'One to eight distinct admitted evidence IDs. Never repeat a citation within a requirement.',
                    items: { type: 'string', enum: manifest.evidence.filter(reference => !reference.generated).map(reference => reference.id) } } },
            required: [...schema.properties.requirements.items.required, 'citations'] } } },
        required: [...schema.required, 'manifestDigest', 'batchId', 'headSha'] };
}
export interface ProgressAssessmentReceipt {
    readonly batchId: string;
    readonly manifestDigest: string;
    readonly headSha: string;
    readonly requirementIds: readonly string[];
    readonly citations: readonly (readonly string[])[];
    readonly result: ReturnType<typeof parseScopedProgressResponse>;
    readonly digest: string;
}
export function readProgressAssessmentEvidence(response: unknown, manifest: ProgressScopeManifest, batch: ProgressAssessmentBatch, locale: string,
    anchors: ProgressScopeAnchors, compact: boolean, requestSchema?: Record<string, unknown>) {
    const payload = progressResponsePayload(response, locale, 'assessment');
    const fail = (reason: ProgressBatchReason, requirementId = 'none'): never => { throw progressBatchRejected(reason, { batch: batch.ordinal, requirementId }); };
    if (!exact(payload, ['outputLocale', 'progress', 'requirements', 'manifestDigest', 'batchId', 'headSha'])
        || payload.manifestDigest !== manifest.digest || payload.headSha !== manifest.headSha) fail('manifest-identity');
    if (payload.batchId !== batch.id) fail('batch-identity');
    if (!Array.isArray(payload.requirements) || payload.requirements.length !== batch.scope.requirements.length) {
        const missing = batch.scope.requirements.find(requirement => !(Array.isArray(payload.requirements) && payload.requirements.some(value => record(value) && value.id === requirement.id)));
        fail('receipt-coverage', missing?.id);
    }
    const citations: (readonly string[])[] = [];
    let repetition: { requirementId: string; citationCount: number; distinctCount: number } | undefined;
    const factLimit = aggregateFactLimit(manifest, compact, anchors);
    const facts = (payload.requirements as unknown[]).map(value => {
        if (!record(value) || !exact(value, ['id', 'status', 'evidence', 'summary', 'remaining', 'citations'])) return fail('receipt-coverage');
        const id = batch.scope.requirements.find(requirement => requirement.id === value.id)?.id;
        if (!id) return fail('receipt-coverage');
        for (const field of ['summary', 'remaining'] as const) {
            const text = value[field];
            if (typeof text === 'string' && [...text].length > factLimit) throw new ProgressCapacityFailure({
                phase: 'assessment', dimension: field === 'summary' ? 'assessment-summary-points' : 'assessment-remaining-points',
                observedCount: [...text].length, supportedLimit: factLimit,
                context: { kind: 'assessment', requirementCount: manifest.scope.requirements.length, batch: batch.ordinal, requirementId: id },
            });
        }
        if (!Array.isArray(value.citations) || value.citations.length < 1 || value.citations.length > 8) return fail('evidence-missing', id);
        for (const citation of value.citations) {
            const reference = manifest.evidence.find(entry => entry.id === citation);
            if (!reference || reference.headSha !== manifest.headSha || reference.generated) fail('evidence-identity', id);
        }
        const distinctCount = new Set(value.citations).size;
        if (!repetition && distinctCount !== value.citations.length) repetition = { requirementId: id, citationCount: value.citations.length, distinctCount };
        citations.push(Object.freeze([...value.citations] as string[]));
        const { citations: _citations, ...fact } = value;
        return fact;
    });
    const canonical = { outputLocale: payload.outputLocale, progress: payload.progress, requirements: facts };
    if (repetition) {
        const scope = progressBatchDisplayScope(batch, compact);
        // A repetition is eligible only when every other native and semantic check passes.
        // A simultaneous completion contradiction must not escape as an eligible completion result.
        try { parseScopedProgressResponse(canonical, locale, scope, anchors); }
        catch (error) {
            if (error instanceof ProgressCompletionMismatch) throw new ApplicationError(error.code, error.message,
                { correlationId: error.correlationId, retryable: error.retryable, recovery: error.recovery });
            throw error;
        }
        throw progressCitationRepetitionError(progressBatchResponseSchema(manifest, batch, anchors, compact), scope, anchors, locale,
            { ...repetition, batch: batch.ordinal, sourceLineId: anchors[repetition.requirementId] ?? 'none' }, requestSchema);
    }
    return { payload: canonical, citations };
}
export function parseProgressAssessmentReceipt(response: unknown, manifest: ProgressScopeManifest, batch: ProgressAssessmentBatch,
    anchors: ProgressScopeAnchors, locale: string, compact: boolean): ProgressAssessmentReceipt {
    const { payload, citations } = readProgressAssessmentEvidence(response, manifest, batch, locale, anchors, compact);
    const facts = payload.requirements;
    const result = parseScopedProgressResponse({ outputLocale: payload.outputLocale, progress: payload.progress, requirements: facts }, locale, progressBatchDisplayScope(batch, compact), anchors);
    const indices = batch.scope.requirements.map(requirement => facts.findIndex(fact => fact.id === requirement.id));
    const body = { batchId: batch.id, manifestDigest: manifest.digest, headSha: manifest.headSha,
        requirementIds: indices.map(index => facts[index].id as string), citations: indices.map(index => citations[index]), result };
    return freezeSnapshot({ ...body, digest: digest(body) });
}
/** Exact-once compatible receipt reduction is repeated at the publication eligibility boundary. */
export function aggregateProgressAssessmentReceipts(manifest: ProgressScopeManifest, batches: readonly ProgressAssessmentBatch[], receipts: readonly ProgressAssessmentReceipt[]) {
    const { digest: manifestDigest, ...manifestBody } = manifest;
    if (digest(manifestBody) !== manifestDigest) throw progressBatchRejected('manifest-identity');
    const accepted = new Map<string, ProgressAssessmentReceipt>();
    for (const receipt of receipts) {
        const batch = batches.find(candidate => candidate.id === receipt.batchId);
        const { digest: receiptDigest, ...body } = receipt;
        if (!batch || receipt.manifestDigest !== manifest.digest || receipt.headSha !== manifest.headSha || digest(body) !== receiptDigest) throw progressBatchRejected('manifest-identity');
        if (receipt.requirementIds.length !== batch.scope.requirements.length
            || receipt.requirementIds.some((id, index) => id !== batch.scope.requirements[index].id)
            || receipt.citations.length !== receipt.requirementIds.length
            || receipt.citations.some(citations => !citations.length || citations.some(id => !manifest.evidence.some(reference => reference.id === id && reference.headSha === manifest.headSha && !reference.generated)))) {
            throw progressBatchRejected('receipt-coverage', { batch: batch.ordinal });
        }
        const previous = accepted.get(receipt.batchId);
        if (previous && previous.digest !== receipt.digest) throw progressBatchRejected('receipt-conflict', { batch: batch.ordinal });
        accepted.set(receipt.batchId, receipt);
    }
    if (accepted.size !== batches.length) throw progressBatchRejected('receipt-coverage', { verified: accepted.size, expected: batches.length });
    const ordered = batches.map(batch => accepted.get(batch.id)!);
    const ids = ordered.flatMap(receipt => receipt.requirementIds);
    if (ids.length === 0 || ids.length !== manifest.scope.requirements.length || new Set(ids).size !== ids.length
        || manifest.scope.requirements.some(requirement => !ids.includes(requirement.id))) throw progressBatchRejected('receipt-coverage');
    const progress = Math.round(ordered.reduce((sum, receipt) => sum + receipt.result.progress * receipt.requirementIds.length, 0) / ids.length);
    const text = (field: 'summary' | 'remaining') => ordered.map(receipt => receipt.result[field]).filter(Boolean).join('\n');
    const summary = text('summary'), remaining = text('remaining');
    for (const [field, value] of [['summary', summary], ['remaining', remaining]] as const) {
        if ([...value].length > MAX_PROGRESS_ASSESSMENT_POINTS) throw new ProgressCapacityFailure({
            phase: 'aggregate', dimension: field === 'summary' ? 'assessment-summary-points' : 'assessment-remaining-points',
            observedCount: [...value].length, supportedLimit: MAX_PROGRESS_ASSESSMENT_POINTS,
            context: { kind: 'assessment', requirementCount: ids.length, batch: 0, requirementId: 'none' },
        });
    }
    return Object.freeze({ progress: remaining ? Math.min(99, progress) : 100, summary, remaining, reasoning: '', publicationId: manifest.digest });
}
