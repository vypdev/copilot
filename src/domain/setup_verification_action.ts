/** Fixed consumer-owned asset: setup may create it, never regenerate or retire it. */
export const SETUP_VERIFICATION_ACTION_PATH = '.github/actions/copilot-verification-setup/action.yml';
export const SETUP_VERIFICATION_ACTION_PARENTS = ['.github', '.github/actions', '.github/actions/copilot-verification-setup'] as const;
export type SetupVerificationActionState = 'create' | 'preserve';
export interface SetupVerificationActionReview {
  readonly action: SetupVerificationActionState | 'blocked';
  readonly enabled: boolean;
  readonly mainBranch: string;
}
