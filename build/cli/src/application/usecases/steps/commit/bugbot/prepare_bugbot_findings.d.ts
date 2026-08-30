import type { PreparedBugbotFindings } from './prepare_bugbot_findings_policy';
export type { BugbotResponse, PreparedBugbotFindings } from './prepare_bugbot_findings_policy';
export declare function prepareBugbotFindings(response: unknown, ignorePatterns: string[], minSeverityValue: string | undefined, maxComments: number): PreparedBugbotFindings | undefined;
