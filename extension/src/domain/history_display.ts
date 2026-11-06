import type { HistoryCopy } from './history_copy_types.ts';
import type { HistoryDocument } from './history_document.ts';

/** A clock accepted by storage can exceed the native Date range; never invent a timestamp. */
export function historyTime(at: number, locale: string): { iso: string; label: string } | null {
    try {
        const date = new Date(at); const iso = date.toISOString();
        return { iso, label: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(date) };
    } catch { return null; }
}
export function historyAdmission(data: HistoryDocument, copy: HistoryCopy): string {
    if (data.collection.collecting) return copy.text.active;
    if (data.collection.globallyPaused) return copy.text.globallyPaused;
    if (data.collection.sessionBlocked) return copy.text.temporary;
    if (data.collection.preference === 'unknown' || !['active', 'paused'].includes(data.collection.policy)) return copy.text.unknown;
    return data.collection.preference === 'on' ? copy.text.activationPending : copy.text.off;
}
