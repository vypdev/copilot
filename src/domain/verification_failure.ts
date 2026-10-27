/** Closed operational facts; never populate these with subprocess output or arbitrary argv. */
export const VERIFICATION_FAILURE_STAGES = ['dependencies', 'repository-setup', 'runtime', 'command'] as const;
export const VERIFICATION_FAILURE_REASONS = ['tool-unavailable', 'unsupported-graph', 'install-failed', 'candidate-changed', 'setup-blocked', 'runtime-blocked', 'command-failed', 'command-invalid'] as const;
export const VERIFICATION_COMMAND_LABELS = ['configured-command', 'pnpm run build', 'pnpm run typecheck', 'pnpm run test:coverage', 'pnpm run lint', 'pnpm run validate:documentation', 'pnpm run validate:specifications'] as const;
export type VerificationFailure = {
    readonly stage: typeof VERIFICATION_FAILURE_STAGES[number];
    readonly reason: typeof VERIFICATION_FAILURE_REASONS[number];
    readonly command: typeof VERIFICATION_COMMAND_LABELS[number];
    readonly commandIndex: number;
}
export type BranchSyncVerificationFailure = VerificationFailure & {
    readonly childSha: string;
    readonly restoration: 'restored' | 'unverified';
}

export function isBranchSyncVerificationFailure(value: Readonly<Record<string, unknown>>): boolean {
    return VERIFICATION_FAILURE_STAGES.some(item => item === value.stage)
        && VERIFICATION_FAILURE_REASONS.some(item => item === value.reason)
        && VERIFICATION_COMMAND_LABELS.some(item => item === value.command)
        && typeof value.commandIndex === 'number' && Number.isSafeInteger(value.commandIndex) && value.commandIndex >= 1 && value.commandIndex <= 20
        && typeof value.childSha === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64}|unavailable)$/u.test(value.childSha)
        && (value.restoration === 'restored' || value.restoration === 'unverified');
}
