import type { SetupConfiguration, SetupRemoteConfiguration } from './setup';
import type { PullRequestApprovalProducer } from './pull_request_approval_policy';

export const SETUP_QUESTIONNAIRE_STATE_ORDER = [
  'capabilities',
  'agent-runtime',
  'agent-model-defaults',
  'agent-role-overrides',
  'repository',
  'deployment',
  'bugbot',
  'pull-request-approval',
  'projects',
  'provisioning',
  'storage',
  'review',
  'confirmation',
  'completed',
  'cancelled',
] as const;

export type SetupQuestionnaireStateId = (typeof SETUP_QUESTIONNAIRE_STATE_ORDER)[number];
export type SetupQuestionKind = 'boolean' | 'number' | 'text' | 'choice' | 'multi-select' | 'scope-overrides' | 'producer-select' | 'project-select';

export type SetupDiscoveryStatus = 'observed' | 'no-recent-runs' | 'no-verifiable-checks' | 'empty' | 'permission-denied' | 'unavailable' | 'unsupported';

export interface SetupProjectCandidate {
  readonly number: number;
  readonly title: string;
  readonly owner: string;
  readonly url: string;
  readonly statusOptions?: readonly string[];
}

export interface SetupDiscoveryResult<T> {
  readonly status: SetupDiscoveryStatus;
  readonly candidates: readonly T[];
  readonly truncated?: boolean;
}

export interface SetupApprovalCheckCandidate {
  readonly name: string;
  readonly sourceAppId: number;
  readonly sourceAppName?: string;
  readonly workflowName: string;
  readonly runUrl: string;
  readonly headSha: string;
  readonly conclusion: string;
  readonly observedAt?: string;
  /** Exact App-bound status check in an active ruleset for this branch; absence means unverified, not optional. */
  readonly requiredByRuleset?: { readonly branch: string; readonly sourceUrl: string };
}

export interface SetupQuestion {
  readonly stateId: Exclude<SetupQuestionnaireStateId, 'review' | 'confirmation' | 'completed' | 'cancelled'>;
  readonly id: string;
  readonly label: string;
  readonly kind: SetupQuestionKind;
  readonly defaultValue: string | number | boolean;
  readonly choices?: readonly string[];
  readonly allowedNames?: readonly string[];
  readonly producerCandidates?: readonly SetupApprovalCheckCandidate[];
  readonly trustedProducers?: readonly PullRequestApprovalProducer[];
  readonly discoveryStatus?: SetupDiscoveryStatus;
  readonly discoveryTruncated?: boolean;
  readonly discoveryRetryRemaining?: number;
  readonly projectCandidates?: readonly SetupProjectCandidate[];
  readonly projectOwner?: string;
  readonly statusOptionState?: 'observed' | 'unavailable' | 'incompatible';
  readonly projectStatusValues?: readonly { readonly transition: 'issueCreated' | 'pullRequestCreated' | 'issueInProgress' | 'pullRequestInProgress'; readonly value: string }[];
  readonly suggestionSource?: 'github' | 'local' | 'configuration' | 'default';
}

export interface SetupQuestionnaireState {
  readonly stateId: SetupQuestionnaireStateId;
  readonly draft: SetupConfiguration;
  readonly question?: SetupQuestion;
  readonly validation?: string;
  readonly terminal: 'collecting' | 'review' | 'confirmation' | 'completed' | 'cancelled';
  readonly configureIndependently: boolean;
  readonly phase?: 'full' | 'permission-intent';
  readonly answeredQuestionIds?: readonly string[];
  readonly projectsWanted?: boolean;
}

export interface SetupQuestionnaireProgress {
  readonly position: number;
  readonly total: number;
  readonly groupPosition: number;
  readonly groupTotal: number;
  readonly group: SetupQuestion['stateId'];
}

export type SetupQuestionnaireEvent =
  | { readonly kind: 'answer'; readonly value: string }
  | { readonly kind: 'back' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'end-of-input' };

export interface SetupQuestionnaireContext {
  readonly remote?: SetupRemoteConfiguration;
  readonly variableNames?: readonly string[];
  readonly secretNames?: readonly string[];
  readonly skipQuestionIds?: readonly string[];
  readonly approvalCheckCandidates?: readonly SetupApprovalCheckCandidate[];
  readonly approvalCheckDiscoveryStatus?: SetupDiscoveryStatus;
  readonly approvalCheckDiscoveryTruncated?: boolean;
  readonly projectDiscovery?: SetupDiscoveryResult<SetupProjectCandidate>;
  readonly projectOwner?: string;
  readonly projectsWanted?: boolean;
  readonly discoveryRetryRemaining?: Readonly<{ checks: number; projects: number }>;
  readonly branchSources?: Readonly<{ main: 'github' | 'configuration' | 'default'; development: 'local' | 'configuration' | 'default' }>;
}
