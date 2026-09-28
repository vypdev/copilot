import type { SetupJourneyView } from '../policies/setup_journey_policy';
import type { SetupQuestion } from '../../domain/setup_questionnaire';
import type { SetupTokenPermissionReport, SetupTokenPermissionRequirement, SetupTokenRole } from '../../domain/setup_token_permissions';

export type WebSetupPrompt =
  | { kind: 'question'; title: string; question: SetupQuestion; phase: string; pass: number }
  | { kind: 'choice'; title: string; description?: string; choices: readonly string[]; defaultValue?: string }
  | { kind: 'text' | 'secret'; title: string; description?: string; optional?: boolean; link?: string }
  | { kind: 'confirm'; title: string; description?: string; choices: readonly string[] }
  | { kind: 'plan'; title: string; plan: WebSetupPlan };

export interface WebSetupPlan {
  readonly files: readonly string[];
  readonly workflows: readonly string[];
  readonly variables: readonly string[];
  readonly secrets: readonly string[];
  readonly warnings: readonly string[];
}

export interface WebSetupView {
  readonly revision: number;
  readonly promptRevision?: number;
  readonly repository: string;
  readonly journey?: SetupJourneyView;
  readonly prompt?: WebSetupPrompt;
  readonly message?: { tone: 'info' | 'success' | 'warning' | 'error'; text: string; link?: string };
  readonly permissions?: { role: SetupTokenRole; requirements?: readonly SetupTokenPermissionRequirement[]; report?: SetupTokenPermissionReport };
  readonly outcome?: 'complete' | 'partial' | 'blocked' | 'cancelled' | 'dry-run';
}
