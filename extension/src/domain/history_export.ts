import { journalKind, type JournalKind } from './journal_facts.ts';
import { validJournalSnapshot } from './local_journal.ts';
import { deepFreeze, utf8Bytes } from './value.ts';
import { historyExportContent } from './history_export_format.ts';

export interface HistoryExportReview { readonly kind: JournalKind; readonly epoch: number; readonly revision: number; readonly content: string }
/** A closed history-only JSON scope; no preference, credential, authored note or current private target is accepted. */
export function previewHistoryExport(kind: JournalKind, snapshot: unknown): HistoryExportReview | null {
    try {
        if (!journalKind(kind)) return null;
        const content = historyExportContent(kind, snapshot);
        if (utf8Bytes(content) > 65536) return null;
        const history: unknown = JSON.parse(content).history;
        if (!validJournalSnapshot(kind, history)) return null;
        return deepFreeze({ kind, epoch: history.epoch, revision: history.revision, content });
    } catch { return null; }
}
