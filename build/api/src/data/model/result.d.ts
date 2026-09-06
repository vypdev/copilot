export type ResultStepFormat = 'plain' | 'markdown';
export interface ResultInput {
    id?: string;
    success?: boolean;
    executed?: boolean;
    steps?: string[];
    payload?: unknown;
    reminders?: string[];
    errors?: unknown[];
    /** Compatibility input while callers migrate to the plural property. */
    error?: unknown;
    stepFormat?: ResultStepFormat;
}
export declare function getResultPayload(payload: unknown): Record<string, unknown> | undefined;
export declare class Result {
    id: string;
    success: boolean;
    executed: boolean;
    steps: string[];
    payload: unknown;
    reminders: string[];
    errors: Error[];
    stepFormat: ResultStepFormat;
    constructor(data: ResultInput);
}
