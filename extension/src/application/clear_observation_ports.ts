import type { ClearFact } from '../domain/clear_fact.ts';
import type { JournalClearOutcome } from '../domain/journal_clear.ts';

export interface ClearOperationTrace {
    confirming(): void; cancelled(): void; blocked(): void; submitted(): void;
    acknowledged(value: 'accepted' | 'unknown' | 'not-applied'): void;
    complete(result: JournalClearOutcome): void;
}
export type ObserveClearOperation = (owner: string, kind: ClearFact['collection'], current: () => boolean) => ClearOperationTrace | null;
export function reportClear(trace: ClearOperationTrace | null | undefined, event: 'confirming' | 'cancelled' | 'blocked' | 'submitted'): void {
    try { trace?.[event](); } catch { /* Secondary observation cannot reject or repeat a native operation. */ }
}
export function acknowledgeClear(trace: ClearOperationTrace | null | undefined, value: 'accepted' | 'unknown' | 'not-applied'): void {
    try { trace?.acknowledged(value); } catch { /* Preserve the native acknowledgement. */ }
}
export function completeClear(trace: ClearOperationTrace | null | undefined, result: JournalClearOutcome): void {
    try { trace?.complete(Object.freeze({ ...result })); } catch { /* Retained primary results remain independently inspectable. */ }
}
