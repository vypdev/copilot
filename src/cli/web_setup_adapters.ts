import type { SetupConfigurationCollectorPort, SetupPlanConfirmationPort, SetupPlanPresenterPort } from '../application/ports/setup_terminal_ports';
import type { SetupCredentialPromptPort, SetupWorkflowUpdatePromptPort } from '../application/ports/setup_wizard_ports';
import type { SetupTokenPermissionPresenterPort } from '../application/ports/setup_token_permission_ports';
import type { SetupJourneyPresenterPort } from '../application/usecases/setup/setup_journey_use_case';
import type { SetupGithubIdentity } from '../application/ports/setup_pat_identity_ports';
import type { SetupCredentialCheck, SetupCredentialDecision, SetupCredentialRequirement, SetupCredentialValue, SetupPlan, SetupWorkflowComparison } from '../domain/setup';
import type { SetupTokenPermissionReport, SetupTokenPermissionRequirement, SetupTokenRole } from '../domain/setup_token_permissions';
import type { SetupQuestionnaireContext, SetupQuestionnaireState } from '../domain/setup_questionnaire';
import { setupQuestionnaireStateLabel, transitionSetupQuestionnaire } from '../application/policies/setup_questionnaire_policy';
import { SetupInteractionCancelledError } from '../application/errors/setup_interaction_cancelled_error';
import { WebSetupBridge, toWebSetupPlan } from './web_setup_bridge';

export class WebSetupQuestionnaireCollector implements SetupConfigurationCollectorPort {
  constructor(private readonly bridge: WebSetupBridge, private readonly pass = 1) {}

  async collect(initial: SetupQuestionnaireState, context: SetupQuestionnaireContext): Promise<SetupQuestionnaireState> {
    let state = initial;
    while (state.terminal === 'collecting' && state.question) {
      if (state.validation) this.bridge.message(state.validation, 'warning');
      const value = await this.bridge.ask({
        kind: 'question', title: setupQuestionnaireStateLabel(state.stateId),
        question: state.question, phase: state.phase ?? 'full', pass: this.pass,
      });
      state = transitionSetupQuestionnaire(state, value === undefined ? { kind: 'cancel' } : { kind: 'answer', value }, context);
    }
    return state;
  }
}

export class WebSetupPlanPresenter implements SetupPlanPresenterPort {
  constructor(private readonly bridge: WebSetupBridge) {}
  present(plan: SetupPlan): void {
    this.bridge.message(`Plan ready: ${plan.selectedFiles.length} files, ${plan.variables.length} Variables and ${plan.requiredSecrets.length} Secret names. Review it before continuing.`);
  }
}

export class WebSetupPlanConfirmation implements SetupPlanConfirmationPort {
  constructor(private readonly bridge: WebSetupBridge) {}
  async confirm(plan: SetupPlan): Promise<{ kind: 'approved' | 'declined' | 'cancelled' }> {
    const response = await this.bridge.ask({ kind: 'plan', title: 'Review your setup plan', plan: toWebSetupPlan(plan) });
    return { kind: response === undefined ? 'cancelled' : response === 'approve' ? 'approved' : 'declined' };
  }
}

export class WebSetupWorkflowUpdatePrompt implements SetupWorkflowUpdatePromptPort {
  constructor(private readonly bridge: WebSetupBridge) {}
  async confirmWorkflowUpdates(comparisons: readonly SetupWorkflowComparison[], forcedByFlag: boolean): Promise<boolean> {
    const changed = comparisons.filter(item => item.status === 'changed' || item.status === 'unmanaged');
    if (!changed.length) return false;
    if (forcedByFlag) return true;
    const answer = await this.bridge.ask({
      kind: 'confirm', title: 'Update existing workflows?',
      description: changed.map(item => `${item.destination} (${item.status})`).join('\n'),
      choices: ['Keep existing', 'Update setup-managed workflows'],
    });
    if (answer === undefined) throw new SetupInteractionCancelledError();
    return answer === 'Update setup-managed workflows';
  }
}

export class WebSetupPermissionPresenter implements SetupTokenPermissionPresenterPort {
  constructor(private readonly bridge: WebSetupBridge) {}
  showRequirements(role: SetupTokenRole, requirements: readonly SetupTokenPermissionRequirement[]): void { this.bridge.requirements(role, requirements); }
  showDetailedRequirements(role: SetupTokenRole, requirements: readonly SetupTokenPermissionRequirement[]): void { this.bridge.requirements(role, requirements); }
  showReport(report: SetupTokenPermissionReport): void { this.bridge.report(report); }
}

export class WebSetupJourneyPresenter implements SetupJourneyPresenterPort {
  constructor(private readonly bridge: WebSetupBridge) {}
  present(view: Parameters<SetupJourneyPresenterPort['present']>[0]): void { this.bridge.setJourney(view); }
}

export class WebSetupCredentialPrompt implements SetupCredentialPromptPort {
  private setupGuide?: string;
  private workflowGuide?: string;
  private guidedSetup = false;
  private botIdentity?: SetupGithubIdentity;
  private resolveBot?: (login: string) => Promise<SetupGithubIdentity>;
  private workflowRequirements?: readonly SetupTokenPermissionRequirement[];

  constructor(private readonly bridge: WebSetupBridge) {}
  get usedGuidedSetupPat(): boolean { return this.guidedSetup; }
  get guidedWorkflowBotIdentity(): SetupGithubIdentity | undefined { return this.botIdentity; }
  configureSetupPatGuide(url: string): void { this.setupGuide = url; }
  useManualSetupPat(): void { this.guidedSetup = false; this.setupGuide = undefined; }
  async chooseSetupPatMethod(): Promise<'guided' | 'manual'> {
    this.guidedSetup = await this.choice('How will you provide your setup PAT?', ['Guided GitHub link', 'Manual PAT']) === 'Guided GitHub link';
    return this.guidedSetup ? 'guided' : 'manual';
  }
  async chooseSetupOwnerKind(): Promise<'Organization' | 'User' | 'unknown'> {
    const answer = await this.choice('What kind of GitHub account owns this repository?', ['Organization', 'Personal account', 'Not sure']);
    return answer === 'Organization' ? 'Organization' : answer === 'Personal account' ? 'User' : 'unknown';
  }
  async reviewSetupPatIntent(): Promise<'continue' | 'revise' | 'manual' | 'details'> {
    const answer = await this.choice('Review these provisional setup PAT grants', ['Continue to GitHub', 'Review setup choices again', 'View full permission table', 'Enter a PAT manually']);
    return answer === 'Review setup choices again' ? 'revise' : answer === 'View full permission table' ? 'details'
      : answer === 'Enter a PAT manually' ? 'manual' : 'continue';
  }
  async requestSetupPat(): Promise<string | undefined> {
    return this.secret('Temporary setup PAT',
      'Use the operator account in GitHub. Complete 2FA there, switch to Only select repositories, select this repository, and copy the generated token here. This token is for this run only; delete it in GitHub afterwards.',
      this.guidedSetup ? this.setupGuide : undefined);
  }
  async confirmGuidedSetupAccount(account?: string): Promise<boolean> {
    if (!this.guidedSetup) return true;
    if (!account) return false;
    return await this.choice(`GitHub authenticated the setup PAT as @${account}. Is that the intended operator account?`, ['Yes, continue', 'No, stop']) === 'Yes, continue';
  }
  showUpdatedSetupPatLink(url: string, stage: 'bootstrap' | 'final', delta?: readonly string[]): void {
    this.bridge.message(`Setup PAT ${stage === 'final' ? 'permissions changed' : 'access failed'}. No setup mutation started. ${delta?.join(', ') ?? ''} Create a corrected PAT using the updated GitHub link.`, 'warning', url);
  }
  showSetupPatCleanupReminder(): void {
    if (this.guidedSetup) this.bridge.message('Delete the temporary setup PAT in GitHub Settings after this run. Closing Copilot does not revoke it.', 'warning', 'https://github.com/settings/personal-access-tokens');
  }
  async confirmUnverifiableTokenPermissions(report: SetupTokenPermissionReport): Promise<boolean> {
    const writes = report.checks.filter(item => item.applicability === 'required' && item.level === 'write' && item.status === 'unverifiable');
    if (!report.confirmationRequired || writes.length === 0) return false;
    return await this.choice('GitHub cannot safely prove these write grants without a mutation. Confirm they are configured exactly as shown.', ['No, stop', 'Yes, I checked them']) === 'Yes, I checked them';
  }
  configureWorkflowPatGuide(url: string, resolveIdentity: (login: string) => Promise<SetupGithubIdentity>, requirements?: readonly SetupTokenPermissionRequirement[]): void {
    this.workflowGuide = url; this.resolveBot = resolveIdentity; this.workflowRequirements = requirements;
  }
  explainCredentialSeparation(requirements: readonly SetupCredentialRequirement[]): void {
    this.bridge.message(`The bot PAT is separate from your setup PAT. Runtime credentials (${requirements.map(item => item.name).join(', ')}) become GitHub Actions Secrets; existing Secret values cannot be read back. This browser flow will not dispatch or install a credential-health workflow before Apply. Re-enter an existing bot PAT so its grants can be audited.`, 'info');
  }
  async requestWorkflowPat(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined> {
    let guide: string | undefined;
    let botInfo = '';
    if (this.workflowGuide) {
      const method = await this.choice('How will you provide the bot PAT?', ['Guided GitHub link', 'Manual PAT']);
      if (method === 'Guided GitHub link') {
        const login = await this.text('Expected GitHub bot login', 'Enter the bot account login, without @. We will verify its numeric account ID against the token.');
        if (!login || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) throw new Error('Enter a valid GitHub bot login.');
        this.botIdentity = await this.resolveBot!(login);
        guide = this.workflowGuide;
        botInfo = `Expected bot account: @${this.botIdentity.login} (GitHub ID ${this.botIdentity.id}). Open GitHub as this account, not the setup operator. `;
      } else if (this.workflowRequirements) this.bridge.requirements('workflow', this.workflowRequirements);
    }
    const value = await this.secret(`${requirement.name} — bot account PAT`,
      `${botInfo}Use the bot account, select only the intended repository and review all grants. Suggested expiry is 90 days. ${current ? `Existing Secret: ${current.status}; its value cannot be read back.` : ''}`,
      guide);
    return value ? { name: requirement.name, value } : undefined;
  }
  async requestApiKey(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined> {
    const value = await this.secret(`${requirement.name} — ${requirement.provider ?? 'provider'} API key`, current?.message, undefined, Boolean(requirement.alternativeGroups?.length));
    return value ? { name: requirement.name, value } : undefined;
  }
  async chooseExistingCredential(requirement: SetupCredentialRequirement, check: SetupCredentialCheck): Promise<SetupCredentialDecision> {
    const answer = await this.choice(`Existing ${requirement.name}: ${check.status}`, ['keep', 'replace', 'skip'], check.message);
    return answer as SetupCredentialDecision;
  }
  showCredentialChecks(checks: readonly SetupCredentialCheck[]): void {
    this.bridge.message(checks.map(item => `${item.name}: ${item.status} — ${item.message}`).join('\n'), checks.some(item => item.status === 'invalid') ? 'warning' : 'success');
  }
  private async choice(title: string, choices: readonly string[], description?: string): Promise<string> {
    const answer = await this.bridge.ask({ kind: 'choice', title, choices, description });
    if (answer === undefined) throw new SetupInteractionCancelledError();
    if (!choices.includes(answer)) throw new Error('Invalid setup choice.');
    return answer;
  }
  private async text(title: string, description?: string): Promise<string> {
    const answer = await this.bridge.ask({ kind: 'text', title, description });
    if (answer === undefined) throw new SetupInteractionCancelledError();
    return answer.trim();
  }
  private async secret(title: string, description?: string, link?: string, optional = false): Promise<string> {
    const answer = await this.bridge.ask({ kind: 'secret', title, description, optional, link });
    if (answer === undefined) throw new SetupInteractionCancelledError();
    return answer.trim();
  }
}
