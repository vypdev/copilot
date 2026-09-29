import type { SetupMessageKey } from './catalog';

/** Shared presentation labels for the same Project Status transitions in questions and plan review. */
export const projectTransitionKey: Readonly<Record<string, SetupMessageKey>> = {
  issueCreated: 'projectTransitionIssueCreated', pullRequestCreated: 'projectTransitionPullRequestCreated',
  issueInProgress: 'projectTransitionIssueInProgress', pullRequestInProgress: 'projectTransitionPullRequestInProgress',
};
