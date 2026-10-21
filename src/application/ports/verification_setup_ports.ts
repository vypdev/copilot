import type { VerificationSetupFailure } from '../policies/verification_setup_policy';

/** An operation-private immutable snapshot, captured before candidate mutation. No credentials. */
export type PreparedVerificationSetup =
    | { readonly kind: 'disabled' }
    | { readonly kind: 'blocked'; readonly reason: VerificationSetupFailure; readonly sourceSha?: string }
    | { readonly kind: 'ready'; readonly script: string; readonly sourceSha: string; readonly workspace: string; readonly node: string; readonly toolRoot?: string };

export const DISABLED_VERIFICATION_SETUP: PreparedVerificationSetup = Object.freeze({ kind: 'disabled' });
