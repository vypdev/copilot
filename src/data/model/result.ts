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

function normalizeError(error: unknown): Error {
    if (error instanceof Error) return error;
    if (typeof error === 'string') return new Error(error);
    try {
        return new Error(JSON.stringify(error) ?? String(error));
    } catch {
        return new Error(String(error));
    }
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
    errors: Error[];
    stepFormat: ResultStepFormat;

    constructor(data: ResultInput) {
        this.id = data['id'] ?? '';
        this.success = data['success'] ?? false;
        this.executed = data['executed'] ?? false;
        this.steps = Array.isArray(data.steps) ? data.steps : [];
        const rawErrors = Array.isArray(data.errors)
            ? data.errors
            : data.error === undefined
                ? []
                : [data.error];
        this.errors = rawErrors.map(normalizeError);
        this.payload = data.payload;
        this.reminders = Array.isArray(data.reminders) ? data.reminders : [];
        this.stepFormat = data['stepFormat'] === 'markdown' ? 'markdown' : 'plain';
    }
}
