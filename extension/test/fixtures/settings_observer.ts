import { vi } from 'vitest';
import { SettingsOperations } from '../../src/application/settings_operations.ts';
import type { ObserveSettingsOperation } from '../../src/application/settings_observation_ports.ts';
import { settingsOperationsFixture, SETTINGS_OWNER } from './settings_operations.ts';

export function settingsObserverFixture() {
    const f = settingsOperationsFixture();
    const trace = { confirming: vi.fn(), submitted: vi.fn(), cancelled: vi.fn(), blocked: vi.fn(), complete: vi.fn() };
    const ports = { ...f.ports, observe: vi.fn<ObserveSettingsOperation>(() => trace) }; const operations = new SettingsOperations(f.repository, ports);
    const preview = async (intent: unknown = { type: 'preferences', values: { density: 'compact' } }) => {
        const value = await operations.preview(intent, SETTINGS_OWNER); if (value.state !== 'preview') throw new Error('expected-preview'); return value;
    };
    return { ...f, port: { ...f.port, get: vi.mocked(f.port.get), set: vi.mocked(f.port.set) }, ports, trace, operations, preview,
        confirm: (value: Awaited<ReturnType<typeof preview>>) => operations.confirm(value.operationId, value.revision, SETTINGS_OWNER) };
}
