import type { PauseRequest } from '../domain/pause_request.ts';

export interface PauseClientPorts {
    request(input: PauseRequest): Promise<unknown>;
    canRead(): boolean; canMutate(): boolean; now(): number; changed(): void;
}
