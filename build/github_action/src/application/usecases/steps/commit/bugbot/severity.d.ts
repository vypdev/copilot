export type SeverityLevel = 'info' | 'low' | 'medium' | 'high';
/** Normalizes user input to a valid SeverityLevel; defaults to 'low' if invalid. */
export declare function normalizeMinSeverity(value: string | undefined): SeverityLevel;
export declare function severityLevel(severity: string | undefined): number;
/** Returns true if the finding's severity is at or above the minimum threshold. */
export declare function meetsMinSeverity(findingSeverity: string | undefined, minSeverity: SeverityLevel): boolean;
