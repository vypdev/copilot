import { localIdentifier } from './center_routes.ts';
import { keys, record } from './value.ts';

export const SESSION_PURPOSES = ['repository-read', 'issues-write', 'actions-write'] as const;
export type SessionPurpose = typeof SESSION_PURPOSES[number];
export const WRITE_PURPOSES = ['issues-write', 'actions-write'] as const;
export type WritePurpose = typeof WRITE_PURPOSES[number];
export type WriteSelections = Readonly<Record<WritePurpose, string | null>>;
export type WriteSelectionView = { readonly state: 'disabled'; readonly selected: null }
    | { readonly state: 'stored' | 'identity-verified'; readonly selected: string };
export type WriteSelectionsView = Readonly<Record<WritePurpose, WriteSelectionView>>;
export const EMPTY_WRITE_SELECTIONS: WriteSelections = Object.freeze({ 'issues-write': null, 'actions-write': null });
export const sessionPurpose = (value: unknown): value is SessionPurpose => SESSION_PURPOSES.includes(value as SessionPurpose);
export const writePurpose = (value: unknown): value is WritePurpose => WRITE_PURPOSES.includes(value as WritePurpose);
/** A supported token family is input hygiene, never evidence of its owner or grants. */
export const optionalRoleCredential = (value: unknown): value is string => typeof value === 'string' && /^github_pat_[A-Za-z0-9_]{1,244}$(?![\s\S])/u.test(value);
export interface PurposeEntry { readonly id: string; readonly role: SessionPurpose }

/** A slot names one existing identity with exactly its own immutable purpose. */
export function validWriteSelections(value: unknown, entries: readonly PurposeEntry[]): value is WriteSelections {
    return record(value) && keys(value, WRITE_PURPOSES) && Object.keys(value).length === 2
        && WRITE_PURPOSES.every(purpose => value[purpose] === null || localIdentifier(value[purpose])
            && entries.some(entry => entry.id === value[purpose] && entry.role === purpose));
}
export function writeSelectionsView(selections: WriteSelections, verified: readonly WritePurpose[] = []): WriteSelectionsView {
    const view = (purpose: WritePurpose): WriteSelectionView => selections[purpose] === null ? { state: 'disabled', selected: null }
        : { state: verified.includes(purpose) ? 'identity-verified' : 'stored', selected: selections[purpose] };
    return Object.freeze({ 'issues-write': Object.freeze(view('issues-write')), 'actions-write': Object.freeze(view('actions-write')) });
}
/** Identity verification conveys no provider grant or operation authority. */
export function validWriteSelectionsView(value: unknown, entries: readonly PurposeEntry[]): value is WriteSelectionsView {
    if (!record(value) || !keys(value, WRITE_PURPOSES) || Object.keys(value).length !== 2) return false;
    return WRITE_PURPOSES.every(purpose => {
        const slot = value[purpose];
        return record(slot) && keys(slot, ['state', 'selected']) && Object.keys(slot).length === 2
            && (slot.state === 'disabled' ? slot.selected === null : ['stored', 'identity-verified'].includes(slot.state as string)
                && localIdentifier(slot.selected) && entries.some(entry => entry.id === slot.selected && entry.role === purpose));
    });
}
