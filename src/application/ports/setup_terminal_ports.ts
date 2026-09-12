import type { SetupPlan } from '../../domain/setup';
import type {
  SetupQuestion,
  SetupQuestionnaireContext,
  SetupQuestionnaireState,
  SetupQuestionnaireStateId,
} from '../../domain/setup_questionnaire';

export type TerminalReadResult =
  | { readonly kind: 'value'; readonly value: string }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'end-of-input' };

/** Raw terminal mechanics only. Product questions and defaults belong elsewhere. */
export interface TerminalDriver {
  isInteractive(): boolean;
  readText(prompt: string): Promise<TerminalReadResult>;
  readSecret(prompt: string): Promise<TerminalReadResult>;
  close(): void;
}

export interface SetupQuestionRenderer {
  showIntroduction(): void;
  showState(stateId: SetupQuestionnaireStateId): void;
  renderPrompt(question: SetupQuestion): string;
  showValidation(message: string): void;
  showCancelled(): void;
}

export interface SetupConfigurationCollectorPort {
  collect(
    initial: SetupQuestionnaireState,
    context: SetupQuestionnaireContext,
  ): Promise<SetupQuestionnaireState>;
}

export interface SetupPlanPresenterPort {
  present(plan: SetupPlan): void;
}

export interface SetupPlanConfirmationPort {
  confirm(plan: SetupPlan): Promise<
    | { readonly kind: 'approved' }
    | { readonly kind: 'declined' }
    | { readonly kind: 'cancelled' }
  >;
}
