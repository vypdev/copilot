import { createHash } from 'node:crypto';
import { ProgressCapacityFailure } from '../errors/progress_capacity_failure';
import { normalizeProgressCapacityContext, type ProgressCapacityContext } from '../../domain/progress_capacity_diagnostic';
import { isProgressEvidencePath } from '../../domain/progress_evidence_path';

const digest = (paths: readonly string[]) => createHash('sha256').update(JSON.stringify(paths)).digest('hex');

/** Callers own proof of the complete source and each accepted path's receipts. */
export function progressComparisonCapacityContext(input: Readonly<{
    baseSha: string; headSha: string; requiredPaths: readonly string[];
    reviewedPaths?: readonly string[]; manifestDigest?: string;
}>): ProgressCapacityContext {
    if (!Array.isArray(input.requiredPaths) || (input.reviewedPaths !== undefined && !Array.isArray(input.reviewedPaths))) {
        throw new TypeError('Invalid progress capacity path attribution.');
    }
    const required = [...input.requiredPaths], reviewedInput = input.reviewedPaths ?? [];
    if (required.some(path => !isProgressEvidencePath(path)) || new Set(required).size !== required.length
        || new Set(reviewedInput).size !== reviewedInput.length || reviewedInput.some(path => !required.includes(path))) {
        throw new TypeError('Invalid progress capacity path attribution.');
    }
    const accepted = new Set(reviewedInput), reviewed = required.filter(path => accepted.has(path));
    const uncovered = required.filter(path => !accepted.has(path));
    const paths: string[] = [];
    for (const path of uncovered.slice(0, 8)) {
        if (Buffer.byteLength(JSON.stringify([...paths, path]), 'utf8') > 8_192) break;
        paths.push(path);
    }
    return normalizeProgressCapacityContext({ kind: 'comparison', baseSha: input.baseSha, headSha: input.headSha,
        manifestDigest: input.manifestDigest ?? 'none', sourceLineId: 'none', requiredPathsDigest: digest(required),
        reviewedPathsDigest: digest(reviewed), uncoveredPathsDigest: digest(uncovered),
        requiredPathCount: required.length, reviewedPathCount: reviewed.length, uncoveredPathCount: uncovered.length, paths });
}

/** Wrap synchronous host planning only; provider calls must stay outside this catch. */
export function withProgressCapacityContext<T>(operation: () => T, context: () => ProgressCapacityContext): T {
    try { return operation(); }
    catch (error) {
        if (!(error instanceof ProgressCapacityFailure) || error.diagnostic.context.kind === 'comparison') throw error;
        let annotated: ProgressCapacityFailure;
        try { annotated = error.withContext(context()); }
        catch { throw error; }
        throw annotated;
    }
}
