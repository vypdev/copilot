export type ReviewState = 'preview' | 'committing' | 'saved' | 'unknown' | 'conflict' | 'stale' | 'cancelled' | 'unavailable';
export interface ReviewChange { readonly id: string; readonly label: string; readonly before: string; readonly after: string }
export interface CenterReview {
    readonly state: ReviewState;
    readonly title: string;
    readonly summary: string;
    readonly revision: number;
    readonly editable: boolean;
    readonly changes: readonly ReviewChange[];
}
export interface ReviewActions { confirm(): void; cancel(): void; dismiss(): void; reload(): void }
export interface ReviewCopy {
    readonly states: Readonly<Record<ReviewState, string>>;
    readonly confirm: string; readonly cancel: string; readonly dismiss: string; readonly reload: string;
    readonly before: string; readonly after: string; readonly effects: string; readonly details: string;
    readonly revision: string; readonly observer: string;
}
