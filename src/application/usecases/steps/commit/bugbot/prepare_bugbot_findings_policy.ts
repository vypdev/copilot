import { deduplicateFindings } from './deduplicate_findings';
import { fileMatchesIgnorePatterns } from './file_ignore';
import { applyCommentLimit } from './limit_comments';
import { normalizeFindingIdForMarker } from './marker';
import { isSafeFindingFilePath } from './path_validation';
import { meetsMinSeverity, normalizeMinSeverity } from './severity';
import type { BugbotFinding } from './types';

export type BugbotResponse = {
    findings?: BugbotFinding[];
    resolved_finding_ids?: string[];
};

export type PreparedBugbotFindings = ReturnType<typeof applyCommentLimit> & {
    resolvedFindingIds: Set<string>;
};

export function normalizeBugbotResponse(response: unknown): { findings: BugbotFinding[]; resolvedFindingIds: Set<string> } | undefined {
    if (response == null || typeof response !== 'object') return undefined;
    const payload = response as BugbotResponse;
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
): ReturnType<typeof applyCommentLimit> {
    const minSeverity = normalizeMinSeverity(minSeverityValue);
    const filteredFindings = deduplicateFindings(findings
        .filter(finding => finding.file == null || String(finding.file).trim() === '' || isSafeFindingFilePath(finding.file))
        .filter(finding => !fileMatchesIgnorePatterns(finding.file, ignorePatterns))
        .filter(finding => meetsMinSeverity(finding.severity, minSeverity)));
    return { ...applyCommentLimit(filteredFindings, maxComments) };
}

function normalizeFindings(findings: BugbotFinding[] | undefined): BugbotFinding[] {
    return (Array.isArray(findings) ? findings : []).flatMap(finding => {
        const normalizedId = typeof finding?.id === 'string' ? normalizeFindingIdForMarker(finding.id) : null;
        return normalizedId == null ? [] : [{ ...finding, id: normalizedId }];
    });
}

function normalizeResolvedFindingIds(findingIds: string[] | undefined): Set<string> {
    return new Set((Array.isArray(findingIds) ? findingIds : []).flatMap(findingId => {
        if (typeof findingId !== 'string') return [];
        const normalizedId = normalizeFindingIdForMarker(findingId);
        return normalizedId == null ? [] : [normalizedId];
    }));
}
