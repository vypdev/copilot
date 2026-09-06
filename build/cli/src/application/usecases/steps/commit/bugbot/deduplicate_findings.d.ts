import type { BugbotFinding } from "./types";
/**
 * Deduplicates only findings that describe the same normalized problem at the
 * same location. Distinct bugs can legitimately share a line and must not be
 * discarded merely because their coordinates coincide.
 */
export declare function deduplicateFindings(findings: BugbotFinding[]): BugbotFinding[];
