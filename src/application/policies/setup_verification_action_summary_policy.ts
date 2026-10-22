import type { SetupVerificationActionReview } from '../../domain/setup_verification_action';
import { SETUP_VERIFICATION_ACTION_PATH } from '../../domain/setup_verification_action';

/** Shared terminal/installation-PR copy contains no repository-controlled Markdown. */
export function setupVerificationActionSummary(review?: SetupVerificationActionReview): readonly string[] {
  if (!review) return [];
  const outcomes = { create: 'Create the starter only if missing', preserve: 'Preserve the existing consumer action byte-for-byte', blocked: 'Blocked: inspect the unsafe action path' };
  return ['Verification setup', `${outcomes[review.action]}: ${SETUP_VERIFICATION_ACTION_PATH}.`,
    `VERIFICATION_SETUP=${review.enabled ? 'true (enabled)' : 'false (disabled)'}.`,
    'The generated placeholder fails until customized. Review and merge project dependency setup onto configured MAIN_BRANCH, then run a real verification. Setup or an installer PR does not establish runtime readiness.'];
}
