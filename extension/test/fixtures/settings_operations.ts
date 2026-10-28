import { vi } from 'vitest';
import { SettingsOperations } from '../../src/application/settings_operations.ts';
import { SettingsRepository } from '../../src/application/settings_repository.ts';
import { memoryStore } from './runtime.ts';

export const SETTINGS_OWNER = 'c'.repeat(32);
export function settingsOperationsFixture() {
    const storage = memoryStore(); const repository = new SettingsRepository(storage.port);
    let now = 1000; let identity = 0; let controllerEpoch = 0; let credentialEpoch = 0;
    const ports = { now: vi.fn(() => now), identifier: vi.fn(() => (++identity).toString(16).padStart(32, '0')),
        fence: vi.fn((owner: string) => owner === SETTINGS_OWNER ? { controllerEpoch, credentialEpoch } : null), notify: vi.fn() };
    return { ...storage, repository, ports, operations: new SettingsOperations(repository, ports),
        advance: (milliseconds: number) => { now += milliseconds; }, takeover: () => { controllerEpoch++; },
        disconnect: () => { credentialEpoch++; } };
}
