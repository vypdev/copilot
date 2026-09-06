export interface BugbotEvalFinding {
    id?: string;
    title: string;
    description?: string;
    file?: string;
    line?: number;
    severity?: string;
    suggestion?: string;
    category?: string;
    confidence?: number;
    symbol?: string;
    codeSnippet?: string;
}
export interface BugbotQualityMetrics {
    expected: number;
    actual: number;
    matched: number;
    precision: number;
    recall: number;
    locationAccuracy: number;
    severityAccuracy: number;
    categoryAccuracy: number;
    f1: number;
    falsePositives: number;
    falseNegatives: number;
    meanLineDistance: number;
    confidenceBrierScore: number;
}
export interface BugbotQualityThresholds {
    readonly precision: number;
    readonly recall: number;
    readonly f1: number;
    readonly locationAccuracy: number;
    readonly severityAccuracy: number;
    readonly categoryAccuracy: number;
    readonly maxConfidenceBrierScore: number;
}
export declare const DEFAULT_BUGBOT_QUALITY_THRESHOLDS: BugbotQualityThresholds;
/** Deterministic offline scoring for prompt/model regression corpora. */
export declare function evaluateBugbotFindings(expected: readonly BugbotEvalFinding[], actual: readonly BugbotEvalFinding[]): BugbotQualityMetrics;
export declare function evaluateBugbotQualityGate(metrics: BugbotQualityMetrics, thresholds?: BugbotQualityThresholds): string[];
