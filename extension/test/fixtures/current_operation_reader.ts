import { afterEach, vi } from 'vitest';
import { CurrentOperationReader } from '../../src/application/current_operation_reader.ts';
import { settingsObservation } from '../../src/domain/settings_observation.ts';
import { CURRENT_TARGET } from './current_operations.ts';

export const CURRENT_REPLY = { state: 'current', operation: { family: 'settings', stage: 'reviewed', fact: settingsObservation('profile-edit', 'reviewed'), target: CURRENT_TARGET,
    sourceCurrent: true, firstObserved: 1000, retention: 'untracked' } } as const;
const readers: CurrentOperationReader[] = [];
afterEach(() => { readers.splice(0).forEach(reader => reader.stop()); });
export function currentReaderFixture() {
    const ports = { request: vi.fn(async (): Promise<unknown> => structuredClone(CURRENT_REPLY)), eligible: vi.fn(() => true), changed: vi.fn() };
    const reader = new CurrentOperationReader(ports); readers.push(reader); return { reader, ports };
}
