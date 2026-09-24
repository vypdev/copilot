import { prepareFindings, normalizeBugbotResponse } from './prepare_bugbot_findings_policy';
import type { BugbotResponse, PreparedBugbotFindings } from './prepare_bugbot_findings_policy';

export type { BugbotResponse, PreparedBugbotFindings } from './prepare_bugbot_findings_policy';

export function prepareBugbotFindings(
    response: unknown,
    ignorePatterns: readonly string[],
    minSeverityValue: string | undefined,
    maxComments: number,
    maxAgentFindings?: number,
): PreparedBugbotFindings | undefined {
    const normalized = normalizeBugbotResponse(response as BugbotResponse | undefined, maxAgentFindings);
    return normalized === undefined
        ? undefined
        : {
            ...prepareFindings(normalized.findings, ignorePatterns, minSeverityValue, maxComments),
            resolvedFindingIds: normalized.resolvedFindingIds,
            resolvedFindingResolutions: normalized.resolvedFindingResolutions,
        };
}
