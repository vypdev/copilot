import type { SessionPreferenceRequest } from '../domain/session_preference_request.ts';

export interface SessionPreferenceClientPorts {
    request(input: SessionPreferenceRequest): Promise<unknown>;
    canRead(): boolean; canMutate(): boolean; now(): number; changed(): void;
}
