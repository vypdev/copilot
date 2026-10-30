import type { SessionPreferenceContext } from './session_preferences.ts';

/** Internal native observation only. None of these selectors is a caller-authored mutation operand. */
export type SessionPreferenceBinding = { readonly state: 'ready'; readonly context: SessionPreferenceContext;
    readonly name: string; readonly account: string; readonly repository: string; readonly organizationId: string | null }
    | { readonly state: 'disconnected' | 'legacy' | 'unavailable' | 'stale' };
