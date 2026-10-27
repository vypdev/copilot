/** Closed operational facts; never populate these with subprocess output or arbitrary argv. */
export declare const VERIFICATION_FAILURE_STAGES: readonly ["dependencies", "repository-setup", "runtime", "command"];
export declare const VERIFICATION_FAILURE_REASONS: readonly ["tool-unavailable", "unsupported-graph", "install-failed", "candidate-changed", "setup-blocked", "runtime-blocked", "command-failed", "command-invalid"];
export declare const VERIFICATION_COMMAND_LABELS: readonly ["configured-command", "pnpm run build", "pnpm run typecheck", "pnpm run test:coverage", "pnpm run lint", "pnpm run validate:documentation", "pnpm run validate:specifications"];
export type VerificationFailure = {
    readonly stage: typeof VERIFICATION_FAILURE_STAGES[number];
    readonly reason: typeof VERIFICATION_FAILURE_REASONS[number];
    readonly command: typeof VERIFICATION_COMMAND_LABELS[number];
    readonly commandIndex: number;
};
export type BranchSyncVerificationFailure = VerificationFailure & {
    readonly childSha: string;
    readonly restoration: 'restored' | 'unverified';
};
export declare function isBranchSyncVerificationFailure(value: Readonly<Record<string, unknown>>): boolean;
