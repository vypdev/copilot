import { deduplicateFindings } from './deduplicate_findings';
import { fileMatchesIgnorePatterns } from './file_ignore';
import { applyCommentLimit, type ApplyLimitResult } from './limit_comments';
import { normalizeFindingIdForMarker } from './marker';
import { isSafeFindingFilePath } from './path_validation';
import { meetsMinSeverity, normalizeMinSeverity } from './severity';
import type { BugbotFinding } from './types';
import { buildFindingFingerprint } from '../../../../../domain/bugbot/finding_identity';

export type BugbotResponse = {
    findings?: BugbotFinding[];
    resolved_finding_ids?: string[];
};

export type PreparedBugbotFindings = ApplyLimitResult & {
    resolvedFindingIds: Set<string>;
    /** All accepted findings, including overflow items, used for reconciliation. */
    activeFindings?: readonly BugbotFinding[];
};

export function normalizeBugbotResponse(response: unknown): { findings: BugbotFinding[]; resolvedFindingIds: Set<string> } | undefined {
    if (response == null || typeof response !== 'object') return undefined;
    const payload = response as Record<string, unknown>;
    return {
        findings: normalizeFindings(payload.findings),
        resolvedFindingIds: normalizeResolvedFindingIds(payload.resolved_finding_ids),
    };
}

export function prepareFindings(
    findings: BugbotFinding[],
    ignorePatterns: string[],
    minSeverityValue: string | undefined,
    maxComments: number,
): ApplyLimitResult & { activeFindings: readonly BugbotFinding[] } {
    const minSeverity = normalizeMinSeverity(minSeverityValue);
    const filteredFindings = deduplicateFindings(findings
        .filter(finding => finding.file == null || String(finding.file).trim() === '' || isSafeFindingFilePath(finding.file))
        .filter(finding => !fileMatchesIgnorePatterns(finding.file, ignorePatterns))
        .filter(finding => meetsMinSeverity(finding.severity, minSeverity)));
    return { ...applyCommentLimit(filteredFindings, maxComments), activeFindings: filteredFindings };
}

function normalizeFindings(findings: unknown): BugbotFinding[] {
    return (Array.isArray(findings) ? findings : []).flatMap(value => {
        if (!isRecord(value)) return [];
        const normalizedId = typeof value.id === 'string' ? normalizeFindingIdForMarker(value.id) : null;
        const title = boundedText(value.title, 500);
        const description = boundedText(value.description, 8_000);
        if (normalizedId == null || !title || !description) return [];
        const file = boundedText(value.file, 500) || undefined;
        const line = typeof value.line === 'number' && Number.isSafeInteger(value.line) && value.line > 0
            ? value.line
            : undefined;
        const severity = boundedText(value.severity, 32) || undefined;
        const suggestion = boundedText(value.suggestion, 8_000) || undefined;
        return normalizedId == null
            ? []
            : [{
                id: normalizedId,
                title,
                description,
                ...(file ? { file } : {}),
                ...(line ? { line } : {}),
                ...(severity ? { severity } : {}),
                ...(suggestion ? { suggestion } : {}),
                fingerprint: buildFindingFingerprint({ file, line, title, description, suggestion }),
            }];
    });
}

function normalizeResolvedFindingIds(findingIds: unknown): Set<string> {
    return new Set((Array.isArray(findingIds) ? findingIds : []).flatMap(findingId => {
        if (typeof findingId !== 'string') return [];
        const normalizedId = normalizeFindingIdForMarker(findingId);
        return normalizedId == null ? [] : [normalizedId];
    }));
}

function boundedText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return '';
    return value.normalize('NFKC').replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}
