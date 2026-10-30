import type { CollectionPolicy } from '../domain/collection_policy.ts';
import type { JournalKind } from '../domain/journal_facts.ts';
import type { CollectionRestrictionResult } from './collection_restrictions.ts';
import type { CollectionAction } from '../domain/collection_operation.ts';
import type { Settings } from '../domain/settings.ts';

/** Background-only witnesses. They are never serialized into a message, preview or view model. */
export interface CollectionCapture { readonly policy: CollectionPolicy | null; readonly stamp: object; readonly settingsRevision: number }
export interface CollectionEffectPlan {
    readonly id: string; readonly action: CollectionAction; readonly kind: JournalKind; readonly before: Settings;
    readonly capture: CollectionCapture; readonly policyId: string;
}
export interface CollectionPreparation { readonly beforeStamp: object; readonly afterStamp: object; readonly result: CollectionRestrictionResult }
export type CollectionPreparations = Partial<Readonly<Record<JournalKind, CollectionPreparation>>>;
export interface CollectionActivationLease {
    current(): boolean;
    accept(policy: CollectionPolicy, sourceCurrent: () => boolean): boolean;
    release(): void;
}
