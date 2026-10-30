import { vi } from 'vitest';
import { TemporaryPauseGuard } from '../../src/application/temporary_pause_guard.ts';
import { TemporaryPauseStore } from '../../src/application/temporary_pause_store.ts';
import { TEMPORARY_PAUSES_KEY, TemporaryPauseReader } from '../../src/application/temporary_pause_reader.ts';
import { DEFAULT_TEMPORARY_PAUSES } from '../../src/domain/temporary_pauses.ts';
import { memoryStore } from './runtime.ts';

export function temporaryStoreFixture() {
    const native = memoryStore(); const guard = new TemporaryPauseGuard(); let live = true;
    const before = { ...DEFAULT_TEMPORARY_PAUSES, tabs: [] as number[] }; const after = { ...before, revision: 1, emergency: true };
    native.values.set(TEMPORARY_PAUSES_KEY, structuredClone(before));
    const ports = { protectedArea: vi.fn(async () => true), changed: vi.fn() };
    const store = new TemporaryPauseStore(native.port, guard, ports); const current = vi.fn(() => live);
    const reader = new TemporaryPauseReader(native.port, ports.protectedArea, () => guard.blocked);
    return { ...native, guard, store, ports, reader, current, before, after, retire: () => { live = false; }, revive: () => { live = true; } };
}
