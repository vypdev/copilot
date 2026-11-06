import type { HistoryRequest } from '../domain/history_request.ts';

/** Source-validated logical transport; native identities and private selectors never enter a presentation surface. */
export interface HistoryClientPorts {
    request(input: HistoryRequest): Promise<unknown>;
    canMutate(): boolean;
    now(): number;
    changed(): void;
}
