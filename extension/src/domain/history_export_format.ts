import type { JournalKind } from './journal_facts.ts';

/** One format owns both reviewed download bytes and generated-row capacity accounting. */
export function historyExportContent(kind: JournalKind, history: unknown): string {
    return JSON.stringify({ schemaVersion: 1, kind, history });
}
