export function parseDelimitedValues(value: unknown): string[] {
    return String(value ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
}
