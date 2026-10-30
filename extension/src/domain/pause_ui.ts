import { deepFreeze } from './value.ts';
import type { CenterCopy } from './center_copy_types.ts';
import type { PauseClientView } from './pause_client_view.ts';
import type { PauseReviewIntent } from './temporary_pause_review.ts';
import type { PauseControlView } from './temporary_pause_controls.ts';

export interface PauseActions { read(): void; preview(intent: PauseReviewIntent, revision: number): void; confirm(): void; cancel(): void; inspect(): void; dismiss(): void }
export interface PauseRouteProps { context: { readonly center: CenterCopy; readonly view: PauseClientView; readonly editable: boolean; readonly available: boolean }; actions: PauseActions }
export interface PauseTabRow { readonly tabId: number; readonly label: string | null; readonly paused: boolean; readonly available: boolean }
/** At most 128 native candidates plus 128 stored scopes; no titles, URLs, private selector or invented unpaused state. */
export function pauseTabRows(value: PauseControlView): readonly PauseTabRow[] {
    if (value.loaded.state !== 'ready') return [];
    const paused = value.loaded.value.tabs; const tabs = new Map<number, PauseTabRow>();
    if (value.targets.state === 'ready') for (const choice of value.targets.tabs) tabs.set(choice.tabId, { ...choice, paused: paused.includes(choice.tabId), available: true });
    for (const tabId of paused) if (!tabs.has(tabId)) tabs.set(tabId, { tabId, label: null, paused: true, available: false });
    return deepFreeze([...tabs.values()].sort((a, b) => a.tabId - b.tabId));
}

/** Local view filter only; no query leaves the native page or becomes an authored preference. */
export function filterPauseTabs(rows: readonly PauseTabRow[], query: string): readonly PauseTabRow[] {
    const needle = query.trim().slice(0, 120).toLowerCase();
    return rows.filter(row => !needle || `${row.tabId} ${row.label ?? ''}`.toLowerCase().includes(needle));
}
