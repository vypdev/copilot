export type ModelInput = Record<string, unknown>;

export function asModelInput(value: unknown): ModelInput {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as ModelInput
        : {};
}

export function readString(input: ModelInput, key: string, fallback = ''): string {
    return typeof input[key] === 'string' ? input[key] as string : fallback;
}

export function readOptionalString(input: ModelInput, key: string): string | undefined {
    return typeof input[key] === 'string' ? input[key] as string : undefined;
}
