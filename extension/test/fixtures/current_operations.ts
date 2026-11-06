import { vi } from 'vitest';
import { CurrentOperations, type CurrentOperationPorts } from '../../src/application/current_operations.ts';
import type { JournalRetention } from '../../src/domain/history_state.ts';

export const CURRENT_OWNER = 'a'.repeat(32);
export const CURRENT_TARGET = { location: { route: 'profiles' as const, detail: 'private-profile' }, label: 'Private profile' };
export function currentOperationsFixture() {
    let now = 1000; let retain = false; let status: JournalRetention = 'pending';
    const ports = { now: vi.fn(() => now), changed: vi.fn(), admit: vi.fn<CurrentOperationPorts['admit']>(() => retain ? Object.freeze({}) : null),
        update: vi.fn<CurrentOperationPorts['update']>(), retention: vi.fn(() => status) };
    const current = vi.fn(() => true); const operations = new CurrentOperations(ports);
    const review = (owner = CURRENT_OWNER) => operations.reviewSettings(owner, 'profile-edit', CURRENT_TARGET, current)!;
    const read = (owner = CURRENT_OWNER) => { const value = operations.read(owner); if (value.state !== 'current') throw new Error('expected-current'); return value.operation; };
    return { operations, ports, current, review, read, at: (value: number) => { now = value; }, retaining: (value: boolean) => { retain = value; }, retention: (value: JournalRetention) => { status = value; } };
}
