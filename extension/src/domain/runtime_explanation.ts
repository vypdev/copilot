export interface RuntimeExplanationRow { readonly label: string; readonly value: string; readonly source?: string }
export interface RuntimeExplanationFeature extends RuntimeExplanationRow { readonly id: string; readonly source: string }
/** Bounded readonly text, never callbacks, selectors, URLs, raw native records or reusable authority. */
export interface RuntimeExplanation {
    readonly title: string; readonly summary: string; readonly scopeTitle: string; readonly pausesTitle: string;
    readonly featuresTitle: string; readonly featuresHint: string; readonly rows: readonly RuntimeExplanationRow[];
    readonly scopes: readonly RuntimeExplanationRow[]; readonly pauses: readonly string[]; readonly features: readonly RuntimeExplanationFeature[];
}
