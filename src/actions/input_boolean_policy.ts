export function isEnabledInput(value: unknown): boolean {
    return value === 'true' || value === true;
}

/** Safety-critical issue workflow switches reject misspellings instead of silently disabling a gate. */
export function parseIssueWorkflowBoolean(value: unknown, inputName: string, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new Error(`${inputName} must be true or false.`);
}
