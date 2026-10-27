import { renderProgressEvidencePath } from '../../domain/progress_evidence_path';
import { progressBinaryEvidenceFacts } from '../../domain/progress_binary_evidence_diagnostic';
import { ApplicationError } from '../errors/application_error';
import type { ProgressDiffChange } from '../ports/progress_diff_query_ports';

export const MAX_PROGRESS_RECOVERED_FILE_BYTES = 1_048_576;
export const MAX_PROGRESS_RECOVERED_BYTES = 4_194_304;
export const MAX_PROGRESS_RECOVERED_FILES = 64;
export const MAX_PROGRESS_OBJECT_REQUESTS = 256;
export const MAX_PROGRESS_TREE_ENTRIES = 50_000;
export const MAX_PROGRESS_EVIDENCE_UNITS = 512;
const UNIT_TEXT_JSON_BYTES = 120_000;

export interface ProgressContentSnapshot { readonly path: string; readonly sha: string; readonly mode: string; readonly text: string }
export interface RecoveredProgressContent { readonly comparisonBaseSha: string; readonly base?: ProgressContentSnapshot; readonly head?: ProgressContentSnapshot }

/** Bounded operator diagnostic; paths are data, never provider URLs, tokens or blob contents. */
export function progressRecoveryError(reason: string, paths: readonly string[], tooLarge = false): ApplicationError {
    return new ApplicationError(tooLarge ? 'validation.evidence-too-large' : 'validation.evidence-unavailable',
        progressRecoveryMessage(reason, paths));
}

function progressRecoveryMessage(reason: string, paths: readonly string[]): string {
    return `Progress was not assessed: ${reason}. Unreviewed paths (${paths.length}): ${paths.slice(0, 8).map(renderProgressEvidencePath).join(', ')}${paths.length > 8 ? ', …' : ''}. Existing progress was retained.`;
}

export function progressBinaryEvidenceUnavailable(paths: readonly string[]): ApplicationError {
    return new ApplicationError('validation.evidence-unavailable', progressRecoveryMessage('binary or invalid UTF-8 content cannot be assessed', paths),
        { recovery: { id: 'progress-binary-evidence-unavailable', variables: progressBinaryEvidenceFacts(paths) } });
}

/** Complete UTF-8, JSON-budgeted slices. No normalization, truncation or duplicated boundary bytes. */
export function progressContentUnits(change: ProgressDiffChange, content: RecoveredProgressContent, fileId: string): readonly ProgressDiffChange[] {
    const { base, head } = content;
    const identical = Boolean(base && head && base.sha === head.sha);
    const snapshots = identical ? [{ side: 'both', snapshot: head! }] : [
        ...(base ? [{ side: 'base', snapshot: base }] : []), ...(head ? [{ side: 'head', snapshot: head }] : []),
    ];
    const identity = { comparisonBaseSha: content.comparisonBaseSha,
        base: base ? Object.freeze({ path: base.path, sha: base.sha, mode: base.mode, bytes: Buffer.byteLength(base.text, 'utf8') }) : null,
        head: head ? Object.freeze({ path: head.path, sha: head.sha, mode: head.mode, bytes: Buffer.byteLength(head.text, 'utf8') }) : null };
    return snapshots.flatMap(({ side, snapshot }) => {
        const chunks: string[] = []; let text = '', cost = 2;
        for (const point of snapshot.text) {
            const size = Buffer.byteLength(JSON.stringify(point), 'utf8') - 2;
            if (cost + size > UNIT_TEXT_JSON_BYTES) { chunks.push(text); text = ''; cost = 2; }
            text += point; cost += size;
        }
        chunks.push(text);
        let offset = 0;
        return chunks.map((chunk, index) => {
            const bytes = Buffer.byteLength(chunk, 'utf8');
            const unit = Object.freeze({ ...change, unitId: `${fileId}-${side}-${index + 1}-of-${chunks.length}`,
                recoveredContent: Object.freeze({ ...identity, side, byteOffset: offset, byteLength: bytes, text: chunk }) });
            offset += bytes; return unit;
        });
    });
}
