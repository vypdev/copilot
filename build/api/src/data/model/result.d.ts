import type { ApplicationError } from './application_error';
export type ResultStepFormat = 'plain' | 'markdown';
export interface ResultInput {
    id?: string;
    success?: boolean;
    executed?: boolean;
    steps?: string[];
    payload?: unknown;
    reminders?: string[];
    errors?: readonly ApplicationError[];
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
    readonly errors: readonly ApplicationError[];
    stepFormat: ResultStepFormat;
    constructor(data: ResultInput);
}
