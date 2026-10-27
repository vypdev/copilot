import { parseScopedProgressResponse, scopedProgressResponseSchema, type ProgressScope } from '../../policies/progress_scope_policy';

export interface ProgressAttemptResult {
    progress: number;
    summary: string;
    reasoning: string;
    remaining: string;
}

export const progressResponseSchema = scopedProgressResponseSchema;

export function parseProgressResponse(response: unknown, targetLocale: string, scope: ProgressScope): ProgressAttemptResult {
    return parseScopedProgressResponse(response, targetLocale, scope);
}
