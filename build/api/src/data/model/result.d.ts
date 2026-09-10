export type ResultStepFormat = 'plain' | 'markdown';
export interface ResultInput {
    id?: string;
    success?: boolean;
    executed?: boolean;
    steps?: string[];
    payload?: unknown;
    reminders?: string[];
    errors?: unknown[];
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
