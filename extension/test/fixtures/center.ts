import { vi } from 'vitest';
import { CenterController, type CenterBinding, type CenterClient } from '../../src/application/center_controller.ts';
import { CenterGateway } from '../../src/application/center_gateway.ts';
import { SettingsRepository } from '../../src/application/settings_repository.ts';
import { SettingsOperations } from '../../src/application/settings_operations.ts';
import { memoryStore } from './runtime.ts';
import type { ProtectedSessionService } from '../../src/application/protected_session.ts';
import type { NamedSessions } from '../../src/application/named_sessions.ts';

export const CENTER_BINDING: CenterBinding = { documentId: 'native-document-one', tabId: 1 };
export const CENTER_SENDER = { id: 'test', url: 'chrome-extension://test/runtime.html#/overview', documentId: CENTER_BINDING.documentId!, tab: { id: 1, incognito: false } };
export function centerFixture(session?: ProtectedSessionService, connections?: NamedSessions) {
    let now = 1000; let identifier = 0; let permitted = true; let credentialEpoch = 0;
    const storage = memoryStore(); const repository = new SettingsRepository(storage.port);
    const ports = { now: vi.fn(() => now), identifier: vi.fn(() => (++identifier).toString(16).padStart(32, '0')),
        permitted: vi.fn(() => permitted), credentialEpoch: vi.fn(() => session?.status().epoch ?? credentialEpoch), changed: vi.fn(() => operations.invalidate()) };
    const controller = new CenterController(ports);
    const operations = new SettingsOperations(repository, { now: ports.now, identifier: ports.identifier,
        fence: id => controller.fence(id), notify: vi.fn() });
    return { ...storage, repository, controller, operations, gateway: new CenterGateway(controller, operations, repository, connections), ports,
        open: (binding: CenterBinding = CENTER_BINDING) => {
            const result = controller.open(binding); if (result.state !== 'ready') throw new Error(result.state); return result as CenterClient;
        }, advance: (milliseconds: number) => { now += milliseconds; }, permit: (value: boolean) => { permitted = value; },
        disconnect: () => { credentialEpoch++; } };
}
