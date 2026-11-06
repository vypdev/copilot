import { expect, it, vi } from 'vitest';
import { JournalWorkQueue } from '../../src/application/journal_work_queue.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';
import { deferred } from '../fixtures/runtime.ts';

const job = (kind: JournalKind = 'diagnostics') => ({ kind });
it('bounds coalesced work including a running record and leaves unrelated kinds runnable behind a reservation', async () => {
    const release = deferred<void>(); const entered = deferred<void>(); const running = job(); let blocked = false;
    const ports = { mayRun: vi.fn((kind: JournalKind) => kind !== 'diagnostics' || !blocked),
        work: vi.fn(async value => { if (value === running) { entered.resolve(); await release.promise; } }), failed: vi.fn(), changed: vi.fn() };
    const queue = new JournalWorkQueue(ports); queue.enqueue(running); expect(queue.idle('diagnostics')).toBe(false);
    expect(queue.idle('recents')).toBe(true); const pending = queue.flush(); await entered.promise;
    expect(queue.idle('recents')).toBe(true); expect(queue.idle('diagnostics')).toBe(false);
    queue.enqueue(running); expect(queue.count('diagnostics')).toBe(1);
    Array.from({ length: 199 }, () => queue.enqueue(job())); expect(queue.enqueue(job())).toBe(false);
    queue.remove(running); expect(queue.enqueue(job())).toBe(false);
    blocked = true; release.resolve(); await pending; expect(queue.count('diagnostics')).toBe(199);
    queue.enqueue(job('recents')); await queue.flush(); expect(ports.work).toHaveBeenCalledTimes(2);
    expect(queue.idle('diagnostics')).toBe(true); queue.stop(); expect(queue.enqueue(job())).toBe(false); expect(queue.count('diagnostics')).toBe(0);
});
it('reentrant callbacks stay single-flight; job, failure, notification and eligibility exceptions cannot spin or halt the queue', async () => {
    let active = 0; let peak = 0;
    const first = job(); const second = job('recents');
    const ports = { mayRun: vi.fn(() => true), work: vi.fn(async value => {
        active++; peak = Math.max(peak, active); if (value === first) queue.enqueue(second); await Promise.resolve(); active--;
        if (value === first) throw new Error('private');
    }), failed: vi.fn(() => { throw new Error('private'); }), changed: vi.fn(() => { queue?.wake(); throw new Error('private'); }) };
    const queue: JournalWorkQueue<ReturnType<typeof job>> = new JournalWorkQueue(ports); queue.enqueue(first); await queue.flush();
    expect(ports.work).toHaveBeenCalledTimes(2); expect(peak).toBe(1); expect(ports.failed).toHaveBeenCalledTimes(1);
    ports.mayRun.mockImplementation(() => { throw new Error('private'); }); queue.enqueue(job()); await queue.flush();
    expect(ports.work).toHaveBeenCalledTimes(2); expect(queue.idle('diagnostics')).toBe(true); queue.stop(); await queue.flush();
});
