import { collectionHistoryFixture, HISTORY_OWNER } from './collection_history.ts';
import { writerFact } from './journal_writer.ts';
import type { HistoryDocument } from '../../src/domain/history_document.ts';

/** Original actual-application wire examples. Generated once and detached/frozen by their production owners. */
let examples: ReturnType<typeof createExamples> | null = null;
export function historyWireExamples() { return examples ??= createExamples(); }
async function createExamples() {
    const f = collectionHistoryFixture(); const off = await f.history.read('diagnostics', () => true) as HistoryDocument;
    const start = await f.controls.previewCollection('diagnostics', 'start', HISTORY_OWNER); if (start.state !== 'preview') throw new Error(start.state);
    const started = await f.controls.collection.confirm(start.operationId, HISTORY_OWNER);
    f.history.writer.admit('diagnostics', writerFact('settled'), () => true); await f.history.writer.flush();
    const active = await f.history.read('diagnostics', () => true) as HistoryDocument;
    const stop = await f.controls.previewCollection('diagnostics', 'stop', HISTORY_OWNER); if (stop.state !== 'preview') throw new Error(stop.state);
    const stopped = await f.controls.collection.confirm(stop.operationId, HISTORY_OWNER);
    const clear = await f.controls.previewClear('diagnostics', HISTORY_OWNER); if (clear.state !== 'preview') throw new Error(clear.state);
    const cleared = await f.controls.clear.confirm(clear.operationId, HISTORY_OWNER);
    const clearedDocument = await f.history.read('diagnostics', () => true) as HistoryDocument;
    return { off, active, start, stop, started, stopped, clear, cleared, clearedDocument };
}
export function changedHistoryField(value: unknown, path: string, replacement: unknown): unknown {
    const copy = structuredClone(value) as Record<string, unknown>; const parts = path.split('.');
    let target = copy; for (const key of parts.slice(0, -1)) target = target[key] as Record<string, unknown>;
    target[parts[parts.length - 1]] = replacement; return copy;
}
