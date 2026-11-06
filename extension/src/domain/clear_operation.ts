/** Closed vocabulary shared below retained plans, journals and current-operation views. */
export const CLEAR_ISSUES = Object.freeze(['invalid', 'stale', 'expired', 'denied', 'busy', 'unavailable',
    'future', 'corrupt', 'clock-invalid', 'exhausted', 'collection-active', 'migration-required'] as const);
export type JournalClearIssue = typeof CLEAR_ISSUES[number];
export const clearIssue = (value: unknown): value is JournalClearIssue => typeof value === 'string' && CLEAR_ISSUES.includes(value as JournalClearIssue);
