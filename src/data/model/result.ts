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

export function getResultPayload(payload: unknown): Record<string, unknown> | undefined {
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : undefined;
}

export class Result {
    id: string;
    success: boolean;
    executed: boolean;
    steps: string[];
    payload: unknown;
    reminders: string[];
    readonly errors: readonly ApplicationError[];
    stepFormat: ResultStepFormat;

    constructor(data: ResultInput) {
        this.id = data['id'] ?? '';
        this.success = data['success'] ?? false;
        this.executed = data['executed'] ?? false;
        this.steps = Array.isArray(data.steps) ? data.steps : [];
        this.errors = Array.isArray(data.errors) ? [...data.errors] : [];
        this.payload = data.payload;
        this.reminders = Array.isArray(data.reminders) ? data.reminders : [];
        this.stepFormat = data['stepFormat'] === 'markdown' ? 'markdown' : 'plain';
    }
}
