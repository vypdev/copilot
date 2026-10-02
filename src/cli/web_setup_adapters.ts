import type { SetupConfigurationCollectorPort, SetupDiscoveryRefreshPort, SetupPlanConfirmationPort, SetupPlanPresenterPort } from '../application/ports/setup_terminal_ports';
import type { SetupCredentialPromptPort, SetupWorkflowUpdatePromptPort } from '../application/ports/setup_wizard_ports';
import type { SetupTokenPermissionPresenterPort } from '../application/ports/setup_token_permission_ports';
import type { SetupJourneyPresenterPort } from '../application/usecases/setup/setup_journey_use_case';
import type { SetupGithubIdentity } from '../application/ports/setup_pat_identity_ports';
import type { SetupCredentialCheck, SetupCredentialDecision, SetupCredentialRequirement, SetupCredentialValue, SetupPlan, SetupWorkflowComparison } from '../domain/setup';
import type { SetupTokenPermissionReport, SetupTokenPermissionRequirement, SetupTokenRole } from '../domain/setup_token_permissions';
import type { SetupQuestion, SetupQuestionnaireContext, SetupQuestionnaireState } from '../domain/setup_questionnaire';
import { refreshSetupQuestionnaireQuestion, setupEditableGroups, setupQuestionnaireProgress, setupQuestionnaireStateLabel, transitionSetupQuestionnaire } from '../application/policies/setup_questionnaire_policy';
import { setupQuestionPresentation } from '../application/policies/setup_question_guidance_policy';
import { SetupInteractionCancelledError } from '../application/errors/setup_interaction_cancelled_error';
import { WebSetupBridge, toWebSetupPlan } from './web_setup_bridge';
import type { WebSetupPromptCopyId } from '../application/contracts/web_setup_view';
import type { WebSetupMessageCopyId } from '../application/contracts/web_setup_view';

export class WebSetupQuestionnaireCollector implements SetupConfigurationCollectorPort {
  constructor(private readonly bridge: WebSetupBridge, private readonly pass = 1) {}

  async collect(initial: SetupQuestionnaireState, context: SetupQuestionnaireContext, discoveryRefresh?: SetupDiscoveryRefreshPort): Promise<SetupQuestionnaireState> {
    let state = initial;
    let currentContext = context;
    while (state.terminal === 'collecting' && state.question) {
      if (state.validation) {
        const copy = validationCopy(state.validation) ?? { id: 'validation.unknown' as const };
        this.bridge.message(state.validation, 'warning', undefined, copy.id, copy.values);
      }
      const value = await this.bridge.ask({
        kind: 'question', title: setupQuestionnaireStateLabel(state.stateId),
        question: state.question, presentation: setupQuestionPresentation(state.question), phase: state.phase ?? 'full', pass: this.pass,
        progress: setupQuestionnaireProgress(state, currentContext), canGoBack: (setupQuestionnaireProgress(state, currentContext)?.position ?? 1) > 1,
      }, discoveryRefresh && state.question.discoveryRetryRemaining ? async () => {
        const kind = state.question?.id === 'projects.ids' ? 'projects'
          : state.question?.id === 'pullRequestApproval.testChecks' ? 'checks' : undefined;
        if (!kind) return undefined;
        const refreshed = await discoveryRefresh.refresh(kind);
        if (!refreshed) return undefined;
        const refreshedState = refreshSetupQuestionnaireQuestion(state, refreshed);
        return refreshedState.question ? { prompt: { kind: 'question' as const,
          title: setupQuestionnaireStateLabel(refreshedState.stateId),
          question: refreshedState.question, presentation: setupQuestionPresentation(refreshedState.question),
          phase: refreshedState.phase ?? 'full' as const, pass: this.pass,
          progress: setupQuestionnaireProgress(refreshedState, refreshed),
          canGoBack: (setupQuestionnaireProgress(refreshedState, refreshed)?.position ?? 1) > 1 },
          commit: () => { currentContext = refreshed; state = refreshedState; } } : undefined;
      } : undefined, () => {
        const previous = transitionSetupQuestionnaire(state, { kind: 'back' }, currentContext);
        if (previous.question?.id === state.question?.id || !previous.question) return undefined;
        return { prompt: { kind: 'question' as const, title: setupQuestionnaireStateLabel(previous.stateId),
          question: previous.question, presentation: setupQuestionPresentation(previous.question),
          phase: previous.phase ?? 'full', pass: this.pass, progress: setupQuestionnaireProgress(previous, currentContext),
          canGoBack: (setupQuestionnaireProgress(previous, currentContext)?.position ?? 1) > 1 },
          commit: () => { state = previous; } };
      });
      state = transitionSetupQuestionnaire(state, value === undefined ? { kind: 'cancel' } : { kind: 'answer', value }, currentContext);
    }
    return state;
  }
}

export class WebSetupPlanPresenter implements SetupPlanPresenterPort {
  constructor(private readonly bridge: WebSetupBridge) {}
  present(plan: SetupPlan): void {
    this.bridge.message(`Plan ready: ${plan.selectedFiles.length} files, ${plan.variables.length} Variables and ${plan.requiredSecrets.length} Secret names. Review it before continuing.`, 'info', undefined, 'plan.ready', { files: String(plan.selectedFiles.length), variables: String(plan.variables.length), secrets: String(plan.requiredSecrets.length) });
  }
}

export class WebSetupPlanConfirmation implements SetupPlanConfirmationPort {
  constructor(private readonly bridge: WebSetupBridge) {}
  async confirm(plan: SetupPlan): Promise<{ kind: 'approved' | 'declined' | 'cancelled' } | { kind: 'revise'; group: SetupQuestion['stateId'] }> {
    const groups = setupEditableGroups(plan.configuration);
    const response = await this.bridge.ask({ kind: 'plan', title: 'Review your setup plan', copyId: 'plan.review', plan: toWebSetupPlan(plan), editGroups: groups });
    if (response?.startsWith('revise:')) {
      const group = response.slice('revise:'.length) as SetupQuestion['stateId'];
      if (groups.includes(group)) return { kind: 'revise', group };
      throw new Error('Invalid setup section.');
    }
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
      copyId: 'workflow.update', copyValues: { files: changed.map(item => item.destination).join(', ') },
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
    this.guidedSetup = await this.choice('How will you provide your setup PAT?', ['Guided GitHub link', 'Manual PAT'], undefined, 'setupPat.method') === 'Guided GitHub link';
    return this.guidedSetup ? 'guided' : 'manual';
  }
  async chooseSetupOwnerKind(): Promise<'Organization' | 'User' | 'unknown'> {
    const answer = await this.choice('What kind of GitHub account owns this repository?', ['Organization', 'Personal account', 'Not sure'], undefined, 'setupPat.ownerKind');
    return answer === 'Organization' ? 'Organization' : answer === 'Personal account' ? 'User' : 'unknown';
  }
  async reviewSetupPatIntent(): Promise<'continue' | 'revise' | 'manual' | 'details'> {
    const answer = await this.choice('Review these provisional setup PAT grants', ['Continue to GitHub', 'Review setup choices again', 'View full permission table', 'Enter a PAT manually'], undefined, 'setupPat.review');
    return answer === 'Review setup choices again' ? 'revise' : answer === 'View full permission table' ? 'details'
      : answer === 'Enter a PAT manually' ? 'manual' : 'continue';
  }
  async requestSetupPat(): Promise<string | undefined> {
    return this.secret('Temporary setup PAT',
      'Use the operator account in GitHub. Complete 2FA there, switch to Only select repositories, select this repository, and copy the generated token here. This token is for this run only; delete it in GitHub afterwards.',
      this.guidedSetup ? this.setupGuide : undefined, false, 'setupPat.entry');
  }
  async confirmGuidedSetupAccount(account?: string): Promise<boolean> {
    if (!this.guidedSetup) return true;
    if (!account) return false;
    return await this.choice(`GitHub authenticated the setup PAT as @${account}. Is that the intended operator account?`, ['Yes, continue', 'No, stop'], undefined, 'setupPat.confirmAccount', { account }) === 'Yes, continue';
  }
  showUpdatedSetupPatLink(url: string, stage: 'bootstrap' | 'final', delta?: readonly string[]): void {
    this.bridge.message(`Setup PAT ${stage === 'final' ? 'permissions changed' : 'access failed'}. No setup mutation started. ${delta?.join(', ') ?? ''} Create a corrected PAT using the updated GitHub link.`, 'warning', url, stage === 'final' ? 'setupPat.corrected.final' : 'setupPat.corrected.bootstrap', { grants: delta?.join(', ') ?? '' });
  }
  showSetupPatCleanupReminder(): void {
    if (this.guidedSetup) this.bridge.message('Delete the temporary setup PAT in GitHub Settings after this run. Closing Copilot does not revoke it.', 'warning', 'https://github.com/settings/personal-access-tokens', 'setupPat.cleanup');
  }
  async confirmUnverifiableTokenPermissions(report: SetupTokenPermissionReport): Promise<boolean> {
    const access = report.checks.filter(item => item.applicability === 'required'
      && item.status === 'unverifiable'
      && (item.level === 'write' || (item.scope === 'organization' && item.permission === 'Projects'
        && item.level === 'read' && item.publicReadEvidence === 'public-organization-projects')));
    if (!report.confirmationRequired || access.length === 0) return false;
    return await this.choice('GitHub could not prove every required PAT grant. Check the displayed grants in GitHub, then explicitly confirm them.', ['No, stop', 'Yes, I checked them'], undefined, 'setupPat.confirmUnverifiedAccess') === 'Yes, I checked them';
  }
  configureWorkflowPatGuide(url: string, resolveIdentity: (login: string) => Promise<SetupGithubIdentity>, requirements?: readonly SetupTokenPermissionRequirement[]): void {
    this.workflowGuide = url; this.resolveBot = resolveIdentity; this.workflowRequirements = requirements;
  }
  explainCredentialSeparation(requirements: readonly SetupCredentialRequirement[]): void {
    this.bridge.message(`The bot PAT is separate from your setup PAT. Runtime credentials (${requirements.map(item => item.name).join(', ')}) become GitHub Actions Secrets; existing Secret values cannot be read back. This browser flow will not dispatch or install a credential-health workflow before Apply. Re-enter an existing bot PAT so its grants can be audited.`, 'info', undefined, 'botPat.separation', { names: requirements.map(item => item.name).join(', ') });
  }
  async requestWorkflowPat(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined> {
    let guide: string | undefined;
    let botInfo = '';
    if (this.workflowGuide) {
      const method = await this.choice('How will you provide the bot PAT?', ['Guided GitHub link', 'Manual PAT'], undefined, 'botPat.method');
      if (method === 'Guided GitHub link') {
        const login = await this.text('Expected GitHub bot login', 'Enter the bot account login, without @. We will verify its numeric account ID against the token.', 'botPat.login');
        if (!login || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) throw new Error('Enter a valid GitHub bot login.');
        this.botIdentity = await this.resolveBot!(login);
        guide = this.workflowGuide;
        botInfo = `Expected bot account: @${this.botIdentity.login} (GitHub ID ${this.botIdentity.id}). Open GitHub as this account, not the setup operator. `;
      } else if (this.workflowRequirements) this.bridge.requirements('workflow', this.workflowRequirements);
    }
    const value = await this.secret(`${requirement.name} — bot account PAT`,
      `${botInfo}Use the bot account, select only the intended repository and review all grants. Suggested expiry is 90 days. ${current ? `Existing Secret: ${current.status}; its value cannot be read back.` : ''}`,
      guide, false, guide ? 'botPat.entry.guided' : 'botPat.entry.manual', { name: requirement.name, account: this.botIdentity?.login ?? '', accountId: String(this.botIdentity?.id ?? ''), existing: current?.status ?? '' });
    return value ? { name: requirement.name, value } : undefined;
  }
  async requestApiKey(requirement: SetupCredentialRequirement, current?: SetupCredentialCheck): Promise<SetupCredentialValue | undefined> {
    const value = await this.secret(`${requirement.name} — ${requirement.provider ?? 'provider'} API key`, current?.message, undefined, Boolean(requirement.alternativeGroups?.length), 'credential.apiKey', { name: requirement.name, provider: requirement.provider ?? 'provider' });
    return value ? { name: requirement.name, value } : undefined;
  }
  async chooseExistingCredential(requirement: SetupCredentialRequirement, check: SetupCredentialCheck): Promise<SetupCredentialDecision> {
    const answer = await this.choice(`Existing ${requirement.name}: ${check.status}`, ['keep', 'replace', 'skip'], check.message, 'credential.existing', { name: requirement.name, status: check.status });
    return answer as SetupCredentialDecision;
  }
  showCredentialChecks(checks: readonly SetupCredentialCheck[]): void {
    this.bridge.message(checks.map(item => `${item.name}: ${item.status} — ${item.message}`).join('\n'), checks.some(item => item.status === 'invalid') ? 'warning' : 'success', undefined, 'credential.checks', { names: checks.map(item => item.name).join(', '), count: String(checks.length) }, checks.map(item => ({ name: item.name, status: item.status })));
  }
  private async choice(title: string, choices: readonly string[], description?: string, copyId?: WebSetupPromptCopyId, copyValues?: Readonly<Record<string, string>>): Promise<string> {
    const answer = await this.bridge.ask({ kind: 'choice', title, choices, description, copyId, copyValues });
    if (answer === undefined) throw new SetupInteractionCancelledError();
    if (!choices.includes(answer)) throw new Error('Invalid setup choice.');
    return answer;
  }
  private async text(title: string, description?: string, copyId?: WebSetupPromptCopyId): Promise<string> {
    const answer = await this.bridge.ask({ kind: 'text', title, description, copyId });
    if (answer === undefined) throw new SetupInteractionCancelledError();
    return answer.trim();
  }
  private async secret(title: string, description?: string, link?: string, optional = false, copyId?: WebSetupPromptCopyId, copyValues?: Readonly<Record<string, string>>): Promise<string> {
    const answer = await this.bridge.ask({ kind: 'secret', title, description, optional, link, copyId, copyValues });
    if (answer === undefined) throw new SetupInteractionCancelledError();
    return answer.trim();
  }
}

export function validationCopy(message: string): { id: WebSetupMessageCopyId; values?: Readonly<Record<string, string>> } | undefined {
  const fixed: Readonly<Record<string, WebSetupMessageCopyId>> = {
    'Select 1–8 observed checks or enter exact name|App ID|workflow tuples.': 'validation.producers',
    'Two trusted producers use the same check name. Coverage stores only one name; choose one producer or rename the CI jobs before continuing.': 'validation.duplicateNames',
    'Open every selected Project in GitHub and confirm that all four exact Status values exist. Answer Yes after checking, or No to choose Projects again.': 'validation.projectStatusVerified',
    'Status values were not confirmed. Choose compatible Projects, then review their Status options again.': 'validation.projectStatusRedo',
    'Enter a non-negative whole number.': 'validation.number',
    'Enter yes or no.': 'validation.boolean',
    'Select one of the listed options.': 'validation.choice',
    'This is the first question in this pass. Review it or cancel setup.': 'validation.firstQuestion',
    'A trusted check was selected more than once.': 'validation.duplicateProducer',
    'The saved Status value is not available in every selected Project. Choose a listed Status option.': 'validation.savedStatus',
    'Selected Projects have no common Status option. Choose compatible Projects or configure them separately.': 'validation.projectIncompatible',
    'Choose at most 10 Projects; separate numbers or URLs with commas.': 'validation.projectLimit',
    'A Project URL needs a known repository owner; enter its positive number instead.': 'validation.projectOwnerNeeded',
    'Enter a valid GitHub Project URL or positive Project number.': 'validation.projectUrl',
    'Enter the positive Project number from its GitHub URL, not a PVT_ GraphQL ID.': 'validation.projectNumber',
    'Project numbers must be positive integers at most 2147483647.': 'validation.projectNumberRange',
    'Issue automation is required by an explicit release or hotfix override. Keep Issues enabled or edit your configuration.': 'validation.fixedIssues',
  };
  if (fixed[message]) return { id: fixed[message] };
  const fixedWorkflow = message.match(/^The (release|hotfix) workflow must (remain enabled|remain disabled) because it is fixed by your configuration\. Match that choice or edit your configuration\.$/u);
  if (fixedWorkflow) return { id: fixedWorkflow[2] === 'remain enabled' ? 'validation.fixedWorkflowEnabled' : 'validation.fixedWorkflowDisabled',
    values: { kind: fixedWorkflow[1] } };
  const inherited = message.match(/^Unknown inherited resource name\(s\): (.+)\.$/u);
  if (inherited) return { id: 'validation.unknownResource', values: { names: inherited[1] } };
  const workflows = message.match(/^Unknown issue workflow\(s\): (.+)\.$/u);
  if (workflows) return { id: 'validation.unknownWorkflow', values: { names: workflows[1] } };
  const owner = message.match(/^Use a GitHub Project URL belonging to ([^,]+), without query parameters\.$/u);
  if (owner) return { id: 'validation.projectOwnerMismatch', values: { owner: owner[1] } };
  const duplicate = message.match(/^Project ([1-9]\d*) was selected more than once\.$/u);
  if (duplicate) return { id: 'validation.projectDuplicate', values: { number: duplicate[1] } };
  return undefined;
}
