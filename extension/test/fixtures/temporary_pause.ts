import { vi } from 'vitest';
import { MessageGateway } from '../../src/application/message_gateway.ts';
import { TemporaryPauseReader } from '../../src/application/temporary_pause_reader.ts';
import { CONFIG, pageSender, pageConfigurationFixture, scopedSettings, emptyPreferenceAdmission } from './page_configuration.ts';
import { memoryStore } from './runtime.ts';

export function temporaryPauseFixture(restricted: () => boolean = () => false, store = memoryStore()) {
    const h = pageConfigurationFixture(scopedSettings()); const protect = vi.fn(async () => true);
    const pauses = new TemporaryPauseReader(store.port, protect, restricted);
    const gateway = new MessageGateway('test', 'chrome-extension://test/', h.repository, h.service, h.ports, undefined, undefined, undefined, pauses, emptyPreferenceAdmission(h));
    return { ...h, store, protect, pauses, gateway, call: (input: unknown = CONFIG) => gateway.handle(input, pageSender) };
}
export const temporaryPauseDocument = (emergency = false, tabs: number[] = []) => ({ schemaVersion: 1, revision: 1, emergency, tabs });
