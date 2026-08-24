import type { BugbotFinding } from "./types";
/**
 * Deduplicates findings by (file, line). When two findings share the same file and line,
 * keeps the first; when they have no file, groups by normalized title and keeps the first.
 * This reduces noise when the agent returns near-duplicate issues.
 */
export declare function deduplicateFindings(findings: BugbotFinding[]): BugbotFinding[];
