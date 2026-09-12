import type { SetupConfiguration, SetupRemoteConfiguration } from './setup';

export const SETUP_QUESTIONNAIRE_STATE_ORDER = [
  'capabilities',
  'agent-runtime',
  'agent-model-defaults',
  'agent-role-overrides',
  'repository',
  'deployment',
  'bugbot',
  'projects',
  'provisioning',
  'storage',
  'review',
  'confirmation',
  'completed',
  'cancelled',
] as const;

export type SetupQuestionnaireStateId = (typeof SETUP_QUESTIONNAIRE_STATE_ORDER)[number];
export type SetupQuestionKind = 'boolean' | 'number' | 'text' | 'choice' | 'scope-overrides';

export interface SetupQuestion {
  readonly stateId: Exclude<SetupQuestionnaireStateId, 'review' | 'confirmation' | 'completed' | 'cancelled'>;
  readonly id: string;
  readonly label: string;
  readonly kind: SetupQuestionKind;
  readonly defaultValue: string | number | boolean;
  readonly choices?: readonly string[];
  readonly allowedNames?: readonly string[];
}

export interface SetupQuestionnaireState {
  readonly stateId: SetupQuestionnaireStateId;
  readonly draft: SetupConfiguration;
  readonly question?: SetupQuestion;
  readonly validation?: string;
  readonly terminal: 'collecting' | 'review' | 'confirmation' | 'completed' | 'cancelled';
  readonly configureIndependently: boolean;
}

export type SetupQuestionnaireEvent =
  | { readonly kind: 'answer'; readonly value: string }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'end-of-input' };

export interface SetupQuestionnaireContext {
  readonly remote?: SetupRemoteConfiguration;
  readonly variableNames?: readonly string[];
  readonly secretNames?: readonly string[];
}
