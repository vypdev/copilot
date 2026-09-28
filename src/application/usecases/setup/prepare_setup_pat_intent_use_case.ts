import type { SetupConfiguration } from '../../../domain/setup';
import type { SetupQuestionnaireContext, SetupQuestionnaireState } from '../../../domain/setup_questionnaire';
import type { SetupTokenPermissionRequirement } from '../../../domain/setup_token_permissions';
import { ApplicationError } from '../../errors/application_error';
import { SetupInteractionCancelledError } from '../../errors/setup_interaction_cancelled_error';
import type { SetupConfigurationOverrides } from '../../policies/setup_configuration_policy';
import { validateSetupConfiguration } from '../../policies/setup_configuration_policy';
import { createSetupPermissionIntentQuestionnaire } from '../../policies/setup_questionnaire_policy';
import { fixedSetupPatIntentQuestionIds, setupPatIntentNeedsOwnerKind, setupPatIntentOwnerConflict } from '../../policies/setup_pat_intent_policy';
import { buildSetupPatIntentPermissionRequirements, buildSetupPatIntentUncertainty } from '../../policies/setup_token_permission_policy';
import { buildSetupPatCreationUrl, UnsupportedSetupPatLinkError } from '../../policies/setup_pat_creation_url_policy';
import { buildInitialSetupConfiguration } from './setup_wizard_use_case';

export interface PrepareSetupPatIntentRequest {
  readonly owner: string;
  readonly repository: string;
  readonly overrides: SetupConfigurationOverrides;
  readonly skipRepositoryVariables: boolean;
  readonly skipRepositorySecrets: boolean;
}

export interface SetupPatIntentPreview {
  readonly draft: SetupConfiguration;
  readonly requirements: readonly SetupTokenPermissionRequirement[];
  readonly uncertain: readonly string[];
  readonly ownerConflict: boolean;
  readonly errors: readonly string[];
  readonly pass: number;
}

export interface PrepareSetupPatIntentPorts {
  collect(initial: SetupQuestionnaireState, context: SetupQuestionnaireContext, pass: number): Promise<SetupQuestionnaireState>;
  chooseOwnerKind(): Promise<'Organization' | 'User' | 'unknown'>;
  review(): Promise<'continue' | 'revise' | 'manual' | 'details'>;
  showPreview(preview: SetupPatIntentPreview): void;
  showDetails(requirements: readonly SetupTokenPermissionRequirement[]): void;
  onManual(reason: 'owner-unknown' | 'chosen' | 'unsupported'): void;
  advanceToSetupPat(): void;
  revisitChoices(): number;
}

export type PrepareSetupPatIntentResult =
  | { readonly kind: 'manual' }
  | {
      readonly kind: 'guided';
      readonly url: string;
      readonly requirements: readonly SetupTokenPermissionRequirement[];
      readonly ownerKind: 'Organization' | 'User';
      readonly permissionIntent: { readonly draft: SetupConfiguration; readonly answeredQuestionIds: readonly string[] };
    };

/** Frontend-neutral preparation; GitHub still issues the PAT in its own UI. */
export class PrepareSetupPatIntentUseCase {
  constructor(private readonly ports: PrepareSetupPatIntentPorts) {}

  async execute(request: PrepareSetupPatIntentRequest): Promise<PrepareSetupPatIntentResult> {
    const fixedQuestionIds = fixedSetupPatIntentQuestionIds(
      request.overrides, request.skipRepositoryVariables, request.skipRepositorySecrets,
    );
    let draft = buildInitialSetupConfiguration({
      mode: 'interactive', overrides: request.overrides,
      skipRepositoryVariables: request.skipRepositoryVariables,
      skipRepositorySecrets: request.skipRepositorySecrets,
    });
    let pass = 1;
    while (true) {
      const context = { skipQuestionIds: fixedQuestionIds };
      const intent = await this.ports.collect(createSetupPermissionIntentQuestionnaire(draft, context), context, pass);
      if (intent.terminal === 'cancelled') throw new SetupInteractionCancelledError();
      draft = intent.draft;
      const ownerKind = setupPatIntentNeedsOwnerKind(draft) ? await this.ports.chooseOwnerKind() : 'User';
      if (ownerKind === 'unknown') {
        this.ports.onManual('owner-unknown');
        return { kind: 'manual' };
      }
      const ownerConflict = setupPatIntentOwnerConflict(draft, ownerKind);
      const errors = validateSetupConfiguration(draft, { allowIncompleteApproval: true });
      const requirements = buildSetupPatIntentPermissionRequirements(draft, ownerKind);
      this.ports.advanceToSetupPat();
      this.ports.showPreview({
        draft, requirements, uncertain: buildSetupPatIntentUncertainty(draft, ownerKind),
        ownerConflict, errors, pass,
      });

      let decision: Awaited<ReturnType<PrepareSetupPatIntentPorts['review']>>;
      do {
        decision = await this.ports.review();
        if (decision === 'details') this.ports.showDetails(requirements);
      } while (decision === 'details');
      if (decision === 'manual') {
        this.ports.onManual('chosen');
        return { kind: 'manual' };
      }
      if (decision === 'revise') {
        pass = this.ports.revisitChoices();
        continue;
      }
      if (ownerConflict || errors.length > 0) {
        throw new ApplicationError('configuration.invalid', 'Correct the reported setup intent or local --config/flags, then retry guided setup. No PAT was requested.');
      }
      try {
        return {
          kind: 'guided',
          url: buildSetupPatCreationUrl({
            role: 'setup', owner: request.owner, repository: request.repository, expiresIn: 1,
            requirements,
          }),
          requirements,
          ownerKind,
          permissionIntent: {
            draft,
            answeredQuestionIds: [...new Set([...fixedQuestionIds, ...(intent.answeredQuestionIds ?? [])])],
          },
        };
      } catch (error) {
        if (!(error instanceof UnsupportedSetupPatLinkError)) throw error;
        this.ports.onManual('unsupported');
        return { kind: 'manual' };
      }
    }
  }
}
