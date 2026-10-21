import type { VerificationSetupFailure } from '../policies/verification_setup_policy';

export interface VerificationSetupFile { readonly path: string; readonly base64: string; readonly executable: boolean }

/** An operation-private immutable snapshot, captured before candidate mutation. No credentials. */
export type PreparedVerificationSetup =
    | { readonly kind: 'disabled' }
    | { readonly kind: 'blocked'; readonly reason: VerificationSetupFailure; readonly sourceSha?: string }
    | { readonly kind: 'ready'; readonly files: readonly VerificationSetupFile[]; readonly sourceSha: string; readonly workspace: string; readonly toolRoot?: string };

export const DISABLED_VERIFICATION_SETUP: PreparedVerificationSetup = Object.freeze({ kind: 'disabled' });
