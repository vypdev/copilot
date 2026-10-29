import type { CollectionInspection, CollectionPreview, CollectionReviewIssue } from './collection_review.ts';
import type { JournalClearInspection, JournalClearPreview, JournalClearIssue } from './journal_clear.ts';
import type { HistoryDocument } from './history_document.ts';
import type { JournalKind } from './journal_facts.ts';
import type { HistoryExportReview } from './history_export.ts';

export type HistoryFamily = 'collection' | 'clear';
export type HistoryIssue = CollectionReviewIssue | JournalClearIssue | 'unchanged';
export type CollectionPlan = Extract<CollectionPreview, { state: 'preview' }>;
export type ClearPlan = Extract<JournalClearPreview, { state: 'preview' }>;
export type HistoryPlan = { readonly family: 'collection'; readonly plan: CollectionPlan } | { readonly family: 'clear'; readonly plan: ClearPlan };
export type HistoryReviewPhase = 'preview' | 'committing' | 'cancelling' | 'result' | 'unknown' | 'stale';
export type HistoryReview = ({ readonly family: 'collection'; readonly plan: Omit<CollectionPlan, 'operationId' | 'state'> }
    | { readonly family: 'clear'; readonly plan: Omit<ClearPlan, 'operationId' | 'state'> })
    & { readonly phase: HistoryReviewPhase; readonly outcome: CollectionInspection | JournalClearInspection | null };
export interface HistoryReadSlot {
    readonly phase: 'idle' | 'reading' | 'ready' | 'unavailable' | 'stale'; readonly current: boolean; readonly data: HistoryDocument | null;
}
export type HistoryReadView = Readonly<Record<JournalKind, HistoryReadSlot>>;
export interface HistoryReviewView {
    readonly review: HistoryReview | null; readonly busy: boolean; readonly checking: boolean;
    readonly kind: JournalKind | null; readonly issue: HistoryIssue | null;
}
export interface HistoryClientView extends HistoryReviewView { readonly slots: HistoryReadView; readonly exportReview: HistoryExportReview | null; readonly exportBusy: boolean; readonly exportFailed: boolean }
export const EMPTY_HISTORY_VIEW: HistoryClientView = Object.freeze({ review: null, busy: false, checking: false, kind: null, issue: null, exportReview: null, exportBusy: false, exportFailed: false,
    slots: Object.freeze({ diagnostics: Object.freeze({ phase: 'idle', current: false, data: null }), recents: Object.freeze({ phase: 'idle', current: false, data: null }) }) });
