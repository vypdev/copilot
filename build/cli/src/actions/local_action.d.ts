import type { Result } from '../data/model/result';
export declare function runLocalAction(additionalParams: Record<string, unknown>, options?: {
    render?: boolean;
}): Promise<Result[]>;
