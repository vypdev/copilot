export interface FindingsResponseOptions {
    expectJson?: boolean;
    schema?: Record<string, unknown>;
    includeReasoning?: boolean;
}
export declare function interpretFindingsResponse(parts: unknown, options: FindingsResponseOptions): string | Record<string, unknown>;
