import type { JournalKind } from './journal_facts.ts';
import type { CollectionAction } from './collection_review.ts';
import type { CenterCopy } from './center_copy_types.ts';
import type { HistoryClientView } from './history_client_view.ts';

export type HistoryRoute = 'activity' | 'diagnostics' | 'privacy';
export interface HistoryActions {
    read(kind: JournalKind): void;
    preview(kind: JournalKind, action: CollectionAction): void;
    clear(kind: JournalKind): void;
    confirm(): void; cancel(): void; inspect(): void; dismiss(): void;
    previewExport(kind: JournalKind): void; cancelExport(): void; downloadExport(): void;
}
export interface HistoryRouteProps {
    context: { readonly copy: CenterCopy; readonly view: HistoryClientView; readonly route: HistoryRoute; readonly editable: boolean };
    actions: HistoryActions;
}
