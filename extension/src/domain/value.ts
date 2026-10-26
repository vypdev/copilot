export function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
export function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every(key => allowed.includes(key));
}
export function natural(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function utf8Bytes(text: string): number {
    let size = 0;
    for (const character of text) {
        const code = character.codePointAt(0)!;
        size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    return size;
}
export function deepFreeze<T>(value: T): Readonly<T> {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}

export function jsonBytesWithin(value: unknown, maximum: number): boolean {
    try { const text = JSON.stringify(value); return typeof text === 'string' && utf8Bytes(text) <= maximum; }
    catch { return false; }
}
