export type TemporaryPauseOutcome = { readonly state: 'committed'; readonly revision: number;
    readonly acknowledgement: 'accepted' | 'unknown'; readonly current: boolean }
    | { readonly state: 'reconciled'; readonly revision: number; readonly current: boolean }
    | { readonly state: 'unknown'; readonly acknowledgement: 'accepted' | 'unknown';
        readonly observation: 'different' | 'unavailable'; readonly observedRevision: number | null; readonly current: boolean }
    | { readonly state: 'invalid' | 'conflict' | 'stale' | 'unavailable' | 'future' | 'corrupt' | 'busy' | 'unchanged' };
