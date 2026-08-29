export type ModelInput = Record<string, unknown>;
export declare function asModelInput(value: unknown): ModelInput;
export declare function readString(input: ModelInput, key: string, fallback?: string): string;
export declare function readOptionalString(input: ModelInput, key: string): string | undefined;
