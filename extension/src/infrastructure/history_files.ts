import { previewHistoryExport } from '../domain/history_export.ts';
import { journalKind, type JournalKind } from '../domain/journal_facts.ts';
import { jsonBytesWithin, keys, record } from '../domain/value.ts';

/** Only exact reviewed history bytes can become a local file; no generic path/body download API. */
export function downloadHistory(document: Document, kind: JournalKind, content: string): boolean {
    let url: string | undefined;
    try {
        if (!journalKind(kind) || typeof content !== 'string' || !jsonBytesWithin(content, 132096)) return false;
        const body: unknown = JSON.parse(content);
        if (!record(body) || !keys(body, ['schemaVersion', 'kind', 'history']) || Object.keys(body).length !== 3
            || body.schemaVersion !== 1 || body.kind !== kind || previewHistoryExport(kind, body.history)?.content !== content) return false;
        url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `copilot-${kind}-history.json`;
        anchor.hidden = true; document.body.append(anchor);
        try { anchor.click(); } finally { anchor.remove(); }
        return true;
    } catch { return false; }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url!), 0); }
}
