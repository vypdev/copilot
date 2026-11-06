import type { TemporaryPauseLoad } from './temporary_pauses.ts';
export interface PauseTabChoice { readonly tabId: number; readonly label: string | null }
export type PauseTabList = { readonly state: 'ready'; readonly tabs: readonly PauseTabChoice[]; readonly limited: boolean }
    | { readonly state: 'unavailable' | 'stale' };
/** No native source, private witness, credential or caller-supplied storage operand is a control view. */
export interface PauseControlView { readonly state: 'ready'; readonly loaded: TemporaryPauseLoad;
    readonly precaution: boolean; readonly pending: boolean; readonly targets: PauseTabList }
