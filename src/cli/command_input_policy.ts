export function cleanCliArgument(value: unknown): string {
    if (value == null) return '';
    const text = String(value);
    return text.startsWith('=') ? text.slice(1) : text;
}

export function joinCliArguments(value: unknown): string {
    return (Array.isArray(value) ? value : [value])
        .map(cleanCliArgument)
        .join(' ')
        .trim();
}

export function parsePositiveCliInteger(value: unknown): number | undefined {
    const parsed = Number.parseInt(cleanCliArgument(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
