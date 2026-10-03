import type { TerminalDriver } from '../application/ports/setup_terminal_ports';
import type { SetupCredentialPromptPort } from '../application/ports/setup_wizard_ports';
import type {
  SetupCredentialCheck,
  SetupCredentialDecision,
  SetupCredentialRequirement,
  SetupCredentialValue,
} from '../domain/setup';
import type { SetupTokenPermissionReport } from '../domain/setup_token_permissions';
import type { SetupGithubIdentity } from '../application/ports/setup_pat_identity_ports';
import { color, renderBox, statusIcon } from './setup_prompt_rendering';
import type { SetupTokenPermissionRequirement } from '../domain/setup_token_permissions';
import { renderSetupTokenPermissionRequirements } from './setup_token_permission_presenter';
import { SetupInteractionCancelledError } from '../application/errors/setup_interaction_cancelled_error';

/** @deprecated Use the presentation-neutral cancellation signal in new adapters. */
export const SetupTerminalCancelledError = SetupInteractionCancelledError;

const AUTHENTICATION_GUIDE = 'https://docs.page/vypdev/copilot/authentication';
const GITHUB_PAT_SETTINGS = 'https://github.com/settings/personal-access-tokens';

export class SetupCredentialPromptAdapter implements SetupCredentialPromptPort {
  private setupPatGuide?: string;
  private workflowPatGuide?: string;
  private resolveBotIdentity?: (login: string) => Promise<SetupGithubIdentity>;
  private guidedSetup = false;
  private setupMethodChosen = false;
  private guidedBotIdentity?: SetupGithubIdentity;
  private workflowPatRequirements?: readonly SetupTokenPermissionRequirement[];

  constructor(
    private readonly terminal: TerminalDriver | undefined,
    private readonly credentialValues: Readonly<Record<string, string>>,
    private readonly confirmUnverifiableWritePermissions = false,
  ) {}

  configureSetupPatGuide(url: string): void { this.setupPatGuide = url; }
  get usedGuidedSetupPat(): boolean { return this.guidedSetup; }
  async chooseSetupPresentationMode(): Promise<'basic' | 'custom'> {
    if (!this.terminal) return 'custom';
    const choice = await this.readChoice('How much configuration detail would you like to review now?',
      ['Basic guided setup', 'Customize every setting'], 'Basic guided setup',
      'Basic keeps every permission, security, branch-role, Projects, approval, and storage decision visible. It uses existing defaults for selected advanced agent, branch-prefix, and Bugbot settings. The final plan shows their consequences and lets you edit any section before Apply. Customize asks every applicable question. Neither path changes GitHub before your final approval.');
    return choice === 'Basic guided setup' ? 'basic' : 'custom';
  }
  async chooseSetupPatMethod(): Promise<'guided' | 'manual'> {
    if (!this.terminal) return 'manual';
    this.setupMethodChosen = true;
    this.guidedSetup = (await this.readChoice('How would you like to provide the setup PAT?', ['guided link', 'manual PAT'], 'guided link',
      `Guided opens GitHub's official fine-grained PAT form with proposed grants. Manual means you create the PAT yourself and enter it here. In either case GitHub handles account sign-in and 2FA; Copilot never revokes the token automatically.\nRead more: ${AUTHENTICATION_GUIDE}`)) === 'guided link';
    return this.guidedSetup ? 'guided' : 'manual';
  }
  useManualSetupPat(): void { this.guidedSetup = false; this.setupPatGuide = undefined; this.setupMethodChosen = true; }
  async chooseSetupOwnerKind(): Promise<'Organization' | 'User' | 'unknown'> {
    if (!this.terminal) return 'unknown';
    const choice = await this.readChoice('Is the GitHub repository owner an organization or a personal account?', ['organization', 'personal account', 'not sure'], undefined,
      `The owner is the name before / in owner/repository. Organization-owned repositories can require organization-level grants or SSO approval; a personal account cannot. Check the repository header on GitHub if unsure.\nRead more: ${AUTHENTICATION_GUIDE}`);
    return choice === 'organization' ? 'Organization' : choice === 'personal account' ? 'User' : 'unknown';
  }
  async reviewSetupPatIntent(): Promise<'continue' | 'revise' | 'manual' | 'details'> {
    if (!this.terminal) return 'manual';
    const choice = await this.readChoice(
      'Review these intended grants before opening GitHub. What would you like to do?',
      ['continue to GitHub', 'review all setup choices again', 'view full permission table', 'enter a PAT manually'],
      undefined,
      `These grants are provisional: your choices and GitHub visibility determine the final least-privilege PAT permissions. Reviewing choices does not restart this setup run or apply changes.\nRead more: ${AUTHENTICATION_GUIDE}`,
    );
    if (choice === 'review all setup choices again') return 'revise';
    if (choice === 'view full permission table') return 'details';
    if (choice === 'enter a PAT manually') return 'manual';
    return 'continue';
  }
  configureWorkflowPatGuide(url: string, resolveIdentity: (login: string) => Promise<SetupGithubIdentity>, requirements?: readonly SetupTokenPermissionRequirement[]): void {
    this.workflowPatGuide = url;
    this.resolveBotIdentity = resolveIdentity;
    this.workflowPatRequirements = requirements;
  }
  get guidedWorkflowBotIdentity(): SetupGithubIdentity | undefined { return this.guidedBotIdentity; }

  async confirmGuidedSetupAccount(account?: string): Promise<boolean> {
    if (!this.guidedSetup || !this.terminal) return true;
    if (!account || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(account)) return false;
    console.log(`GitHub authenticated the setup PAT as @${account}.`);
    return (await this.readChoice('Is this the account you intended to configure with?', ['yes', 'no'], 'yes',
      `Use the operator account that is authorized to configure this repository and organization. A different account's PAT may have different access even if the form looked correct. Select no to stop safely.\nRead more: ${AUTHENTICATION_GUIDE}`)) === 'yes';
  }

  showSetupPatCleanupReminder(): void {
    if (!this.guidedSetup || !this.setupPatGuide) return;
    console.log(renderBox(
      'The setup PAT was not revoked automatically. After setup finishes or is cancelled, delete it in GitHub → Settings → Developer settings → Personal access tokens. Ending this process does not remove the token from GitHub.',
      'Revoke temporary setup PAT',
      33,
    ));
    console.log('https://github.com/settings/personal-access-tokens');
  }

  showUpdatedSetupPatLink(url: string, stage: 'bootstrap' | 'final', delta?: readonly string[]): void {
    if (!this.guidedSetup) return;
    console.log(renderBox(
      stage === 'bootstrap'
        ? 'The setup PAT did not pass the initial access check; no setup plan has been applied. Review its grants in GitHub or create a replacement with this link, then rerun. Select only the intended repository in GitHub.'
        : 'The selected plan requires access this PAT did not prove; no plan mutation has started. Update its grants in GitHub or create a replacement with this link, then rerun. Select only the intended repository in GitHub.',
      stage === 'bootstrap' ? 'Setup PAT access needs attention' : 'Setup PAT permissions changed',
      33,
    ));
    if (delta?.length) console.log(delta.map(item => `  - ${item}`).join('\n'));
    console.log(url);
  }

  async requestSetupPat(): Promise<string | undefined> {
    if (!this.terminal) return undefined;
    if (this.setupPatGuide && !this.setupMethodChosen) {
      this.guidedSetup = (await this.readChoice('How would you like to provide the setup PAT?', ['guided link', 'manual PAT'], 'guided link',
        `Guided opens GitHub's official form; manual uses a PAT you made yourself. Both are entered only into this local command.\nRead more: ${AUTHENTICATION_GUIDE}`)) === 'guided link';
      if (this.guidedSetup) {
        console.log(renderBox(
          'Provisional link: Open this GitHub link in your browser, sign in as the account configuring this repository, complete any 2FA or SSO, and review the prefilled fine-grained permissions. GitHub owns token creation; Copilot never handles your web session. Change All repositories to Only select repositories and select ONLY this repository. Remote inspection may require a corrected token later.',
          'Create setup PAT in GitHub', 33,
        ));
        console.log(this.setupPatGuide);
        console.log('Copy the one-time token from GitHub and paste it below. It is hidden and used only for this setup run.');
      }
    }
    if (this.setupMethodChosen && this.guidedSetup && this.setupPatGuide) {
      console.log(renderBox(
        'Open this GitHub link as the account configuring this repository; complete any 2FA or SSO. Review the prefilled grants. Change All repositories to Only select repositories and select ONLY this repository. GitHub creates the PAT; Copilot does not handle your browser session. Remote inspection may require a corrected token later.',
        'Create setup PAT in GitHub', 33,
      ));
      console.log(this.setupPatGuide);
      console.log('Copy the one-time token from GitHub and paste it below. It is hidden and used only for this setup run.');
    }
    console.log(renderBox(
      'Enter a GitHub setup PAT. It is used in memory for this run only and is never stored. The workflow PAT is a different bot-account token and is requested separately.',
      'Setup PAT',
      33,
    ));
    console.log(`PAT creation and cleanup: ${AUTHENTICATION_GUIDE}\nGitHub PAT settings: ${GITHUB_PAT_SETTINGS}`);
    return this.readSecret('Setup PAT');
  }

  async confirmUnverifiableTokenPermissions(report: SetupTokenPermissionReport): Promise<boolean> {
    const permissions = report.checks
      .filter(check => check.applicability === 'required'
        && check.status === 'unverifiable'
        && (check.level === 'write' || (check.scope === 'organization'
          && check.permission === 'Projects' && check.level === 'read'
          && check.publicReadEvidence === 'public-organization-projects')))
      .map(check => `${check.permission} ${check.level} (${check.scope})`);
    if (!report.confirmationRequired || permissions.length === 0) return false;
    const needsProjectReadAttestation = report.checks.some(check => check.applicability === 'required'
      && check.permission === 'Projects' && check.level === 'read'
      && check.publicReadEvidence === 'public-organization-projects');
    if (this.confirmUnverifiableWritePermissions && !needsProjectReadAttestation) {
      console.log(renderBox(
        `Explicit acknowledgement received for: ${permissions.join(', ')}. These permissions remain Unverifiable; no test mutation was performed.`,
        'Write permission acknowledgement',
        33,
      ));
      return true;
    }
    if (!this.terminal) return false;
    while (true) {
      const result = await this.terminal.readText([
        'GitHub could not prove these required PAT grants. Check them in GitHub:',
        ...permissions.map(permission => `  - ${permission}`),
        `Confirm that the PAT was configured exactly as shown above? ${color('[N]', 90)}: `,
      ].join('\n'));
      if (result.kind !== 'value') throw new SetupTerminalCancelledError();
      const value = result.value.normalize('NFKC').trim().toLowerCase();
      if (!value || ['n', 'no', 'false', '0'].includes(value)) return false;
      if (['y', 'yes', 'true', '1'].includes(value)) return true;
      console.log(color('Enter yes or no.', 33));
    }
  }

  explainCredentialSeparation(requirements: readonly SetupCredentialRequirement[]): void {
    if (!this.terminal) return;
    console.log(renderBox(
      'The workflow PAT is not the setup PAT. Runtime credentials are stored remotely as GitHub Actions Secrets. GitHub never reveals existing Secret values; health is checked through the repository workflow.',
      'Workflow credentials',
      33,
    ));
    console.log(`Credential options: ${requirements.map((requirement) => requirement.name).join(', ')}`);
    console.log(`Why these credentials are separate: ${AUTHENTICATION_GUIDE}`);
  }

  async requestWorkflowPat(
    requirement: SetupCredentialRequirement,
    current?: SetupCredentialCheck,
  ): Promise<SetupCredentialValue | undefined> {
    if (this.terminal && !this.credentialValues[requirement.name]?.trim() && this.workflowPatGuide) {
      let choice: string;
      do {
        choice = await this.readChoice('How would you like to provide the bot workflow PAT?', ['guided link', 'manual PAT', 'view full permission table'], 'guided link',
          `Use a PAT from the dedicated bot account, not the operator setup PAT. Guided opens GitHub's form; manual keeps the permission table visible. The bot PAT is installed as an Actions Secret only after Apply.\nRead more: ${AUTHENTICATION_GUIDE}`);
        if (choice === 'view full permission table' && this.workflowPatRequirements) {
          console.log(renderSetupTokenPermissionRequirements('workflow', this.workflowPatRequirements));
        }
      } while (choice === 'view full permission table');
      const guided = choice === 'guided link';
      if (guided) {
        const login = await this.readBotLogin();
        const identity = await this.resolveBotIdentity!(login);
        this.guidedBotIdentity = identity;
        console.log(`Expected bot account resolved: @${identity.login} (GitHub account ID ${identity.id}).`);
        console.log(renderBox(
          `Open this link in a separate/private browser session, sign in as @${login} (the bot account), and complete its 2FA or SSO. Review every grant and select ONLY the intended repository manually. GitHub creates the PAT; Copilot does not store bot web credentials. The suggested expiry is 90 days—renew the token and update the Actions Secret before then.`,
          'Create bot PAT in GitHub', 33,
        ));
        console.log(this.workflowPatGuide);
        console.log('Copy the one-time bot token and paste it below. It will be validated before any Secret is written.');
      } else if (this.workflowPatRequirements) {
        console.log(renderSetupTokenPermissionRequirements('workflow', this.workflowPatRequirements));
      }
    }
    return this.requestSecretForRequirement(requirement, current, 'workflow PAT owned by the bot account');
  }

  private async readBotLogin(): Promise<string> {
    while (true) {
      const result = await this.terminal!.readText('Expected GitHub bot login (without @; type ? for help): ');
      if (result.kind !== 'value') throw new SetupTerminalCancelledError();
      const login = result.value.trim();
      if (login === '?') {
        console.log(renderBox(`Enter the exact GitHub username of the separate bot account, without @. Copilot resolves its numeric account ID and compares it with the PAT before any Secret is written. It does not sign in as the bot or store its web credentials.\nRead more: ${AUTHENTICATION_GUIDE}`, 'About the bot account'));
        continue;
      }
      if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login)) return login;
      console.log(color('Enter a valid GitHub account login.', 33));
    }
  }

  requestApiKey(
    requirement: SetupCredentialRequirement,
    current?: SetupCredentialCheck,
  ): Promise<SetupCredentialValue | undefined> {
    return this.requestSecretForRequirement(requirement, current, `${requirement.provider ?? 'provider'} API key`);
  }

  async chooseExistingCredential(
    requirement: SetupCredentialRequirement,
    check: SetupCredentialCheck,
  ): Promise<SetupCredentialDecision> {
    if (this.credentialValues[requirement.name]?.trim()) return 'replace';
    if (!this.terminal) return 'keep';
    console.log(`Existing ${requirement.name}: ${check.status}. ${check.message}`);
    return this.readChoice(
      `How should Copilot handle the existing ${requirement.name}?`,
      ['keep', 'replace', 'skip'],
      check.status === 'valid' ? 'keep' : 'replace',
      `Keep retains the existing Secret; GitHub does not reveal its value for inspection. Replace asks for a new credential and may update the Secret after Apply. Skip leaves this optional credential unconfigured. Check the plan before approving writes.\nRead more: ${AUTHENTICATION_GUIDE}`,
    ) as Promise<SetupCredentialDecision>;
  }

  showCredentialChecks(checks: readonly SetupCredentialCheck[]): void {
    if (checks.length === 0) return;
    console.log(renderBox(
      checks.map((check) => `  ${statusIcon(check.status)} ${check.name}: ${check.status} — ${check.message}`).join('\n'),
      'Credential validation',
      checks.some((check) => check.status === 'invalid') ? 31 : 32,
    ));
  }

  private async requestSecretForRequirement(
    requirement: SetupCredentialRequirement,
    current: SetupCredentialCheck | undefined,
    label: string,
  ): Promise<SetupCredentialValue | undefined> {
    const supplied = this.credentialValues[requirement.name]?.trim();
    if (supplied) return { name: requirement.name, value: supplied };
    if (!this.terminal) return undefined;
    if (current) console.log(`${requirement.name}: ${current.status} (${current.message})`);
    const value = await this.readSecret(`${requirement.name} — ${label}`);
    return value ? { name: requirement.name, value } : undefined;
  }

  private async readSecret(label: string): Promise<string> {
    const result = await this.terminal!.readSecret(label);
    if (result.kind !== 'value') throw new SetupTerminalCancelledError();
    return result.value.trim();
  }

  private async readChoice(
    label: string,
    choices: readonly string[],
    defaultValue?: string,
    help?: string,
  ): Promise<string> {
    while (true) {
      const lines = choices.map((choice, index) =>
        `  ${index + 1}) ${choice}${choice === defaultValue ? color(' (default)', 90) : ''}`);
      const result = await this.terminal!.readText([
        label,
        ...lines,
        ...(help ? ['Type ? for more detail without selecting an answer.'] : []),
        `Select 1-${choices.length}${defaultValue ? ` ${color(`[${choices.indexOf(defaultValue) + 1}]`, 90)}` : ''}: `,
      ].join('\n'));
      if (result.kind !== 'value') throw new SetupTerminalCancelledError();
      if (result.value.trim() === '?' && help) {
        console.log(renderBox(help, 'About this credential choice'));
        continue;
      }
      if (!result.value.trim() && defaultValue) return defaultValue;
      const index = Number(result.value) - 1;
      if (Number.isInteger(index) && choices[index]) return choices[index];
      console.log(color('Select one of the listed options.', 33));
    }
  }
}
