export interface BugbotEvalFinding {
    id?: string;
    title: string;
    description?: string;
    file?: string;
    line?: number;
    severity?: string;
    suggestion?: string;
}
export interface BugbotQualityMetrics {
    expected: number;
    actual: number;
    matched: number;
    precision: number;
    recall: number;
    locationAccuracy: number;
    severityAccuracy: number;
}
/** Deterministic offline scoring for prompt/model regression corpora. */
export declare function evaluateBugbotFindings(expected: readonly BugbotEvalFinding[], actual: readonly BugbotEvalFinding[]): BugbotQualityMetrics;
