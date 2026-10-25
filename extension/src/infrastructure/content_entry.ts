import { isEligibleGitHubUrl } from '../domain/eligibility.ts';

/** H1 ends at the guard. No mount, observers, messages, storage or network. */
isEligibleGitHubUrl(globalThis.location.href);
