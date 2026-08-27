export type SeverityLevel = 'info' | 'low' | 'medium' | 'high';

const VALID_SEVERITIES: SeverityLevel[] = ['info', 'low', 'medium', 'high'];

/** Normalizes user input to a valid SeverityLevel; defaults to 'low' if invalid. */
export function normalizeMinSeverity(value: string | undefined): SeverityLevel {
    if (!value) return 'low';
    const normalized = value.toLowerCase().trim() as SeverityLevel;
    return VALID_SEVERITIES.includes(normalized) ? normalized : 'low';
}

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
};

export function severityLevel(severity: string | undefined): number {
    if (!severity) return SEVERITY_ORDER.low;
    const normalized = severity.toLowerCase().trim() as SeverityLevel;
    return SEVERITY_ORDER[normalized] ?? SEVERITY_ORDER.low;
}

/** Returns true if the finding's severity is at or above the minimum threshold. */
export function meetsMinSeverity(
    findingSeverity: string | undefined,
    minSeverity: SeverityLevel
): boolean {
    return severityLevel(findingSeverity) >= SEVERITY_ORDER[minSeverity];
}
