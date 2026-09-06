import { type BugbotEvalFinding, type BugbotQualityMetrics, type BugbotQualityThresholds } from './bugbot_quality_eval';
export interface BugbotBenchmarkCase {
    readonly id: string;
    readonly language: string;
    readonly category: string;
    readonly description: string;
    readonly file: string;
    readonly startLine: number;
    readonly diff: string;
    readonly expected: readonly BugbotEvalFinding[];
}
export interface BugbotBenchmarkCorpus {
    readonly schemaVersion: 1;
    readonly cases: readonly BugbotBenchmarkCase[];
}
export interface BugbotBenchmarkPredictions {
    readonly schemaVersion: 1;
    readonly predictions: Readonly<Record<string, readonly BugbotEvalFinding[]>>;
}
export declare function loadBugbotBenchmark(path: string): Promise<BugbotBenchmarkCorpus>;
export declare function loadBugbotPredictions(path: string): Promise<BugbotBenchmarkPredictions>;
export declare function evaluateBugbotBenchmark(corpus: BugbotBenchmarkCorpus, predictions: BugbotBenchmarkPredictions, thresholds?: BugbotQualityThresholds): {
    metrics: BugbotQualityMetrics;
    violations: string[];
    missingCases: string[];
};
