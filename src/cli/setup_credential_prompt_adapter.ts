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

export class SetupTerminalCancelledError extends Error {
  constructor() {
    super('Setup input was cancelled.');
    this.name = 'SetupTerminalCancelledError';
  }
}

export class SetupCredentialPromptAdapter implements SetupCredentialPromptPort {
  private setupPatGuide?: string;
  private workflowPatGuide?: string;
  private resolveBotIdentity?: (login: string) => Promise<SetupGithubIdentity>;
  private guidedSetup = false;
  private setupMethodChosen = false;
  private guidedBotIdentity?: SetupGithubIdentity;

  constructor(
    private readonly terminal: TerminalDriver | undefined,
    private readonly credentialValues: Readonly<Record<string, string>>,
    private readonly confirmUnverifiableWritePermissions = false,
  ) {}

  configureSetupPatGuide(url: string): void { this.setupPatGuide = url; }
  get usedGuidedSetupPat(): boolean { return this.guidedSetup; }
  async chooseSetupPatMethod(): Promise<'guided' | 'manual'> {
    if (!this.terminal) return 'manual';
    this.setupMethodChosen = true;
    this.guidedSetup = (await this.readChoice('How would you like to provide the setup PAT?', ['guided link', 'manual PAT'], 'guided link')) === 'guided link';
    return this.guidedSetup ? 'guided' : 'manual';
  }
  useManualSetupPat(): void { this.guidedSetup = false; this.setupPatGuide = undefined; this.setupMethodChosen = true; }
  async chooseSetupOwnerKind(): Promise<'Organization' | 'User' | 'unknown'> {
    if (!this.terminal) return 'unknown';
    const choice = await this.readChoice('Is the GitHub repository owner an organization or a personal account?', ['organization', 'personal account', 'not sure']);
    return choice === 'organization' ? 'Organization' : choice === 'personal account' ? 'User' : 'unknown';
  }
  async reviewSetupPatIntent(): Promise<'continue' | 'revise' | 'manual'> {
    if (!this.terminal) return 'manual';
    return await this.readChoice('Review these intended grants before opening GitHub. Continue, revise choices, or enter a PAT manually?', ['continue', 'revise', 'manual']) as 'continue' | 'revise' | 'manual';
  }
  configureWorkflowPatGuide(url: string, resolveIdentity: (login: string) => Promise<SetupGithubIdentity>): void {
    this.workflowPatGuide = url;
    this.resolveBotIdentity = resolveIdentity;
  }
  get guidedWorkflowBotIdentity(): SetupGithubIdentity | undefined { return this.guidedBotIdentity; }

  async confirmGuidedSetupAccount(account?: string): Promise<boolean> {
    if (!this.guidedSetup || !this.terminal) return true;
    if (!account || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(account)) return false;
    console.log(`GitHub authenticated the setup PAT as @${account}.`);
    return (await this.readChoice('Is this the account you intended to configure with?', ['yes', 'no'], 'yes')) === 'yes';
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
      this.guidedSetup = (await this.readChoice('How would you like to provide the setup PAT?', ['guided link', 'manual PAT'], 'guided link')) === 'guided link';
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
    return this.readSecret('Setup PAT');
  }

  async confirmUnverifiableTokenPermissions(report: SetupTokenPermissionReport): Promise<boolean> {
    const permissions = report.checks
      .filter(check => check.applicability === 'required'
        && check.level === 'write'
        && check.status === 'unverifiable')
      .map(check => `${check.permission} ${check.level} (${check.scope})`);
    if (!report.confirmationRequired || permissions.length === 0) return false;
    if (this.confirmUnverifiableWritePermissions) {
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
        'GitHub cannot safely prove these write permissions without a mutation:',
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
  }

  async requestWorkflowPat(
    requirement: SetupCredentialRequirement,
    current?: SetupCredentialCheck,
  ): Promise<SetupCredentialValue | undefined> {
    if (this.terminal && !this.credentialValues[requirement.name]?.trim() && this.workflowPatGuide) {
      const guided = (await this.readChoice('How would you like to provide the bot workflow PAT?', ['guided link', 'manual PAT'], 'guided link')) === 'guided link';
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
      }
    }
    return this.requestSecretForRequirement(requirement, current, 'workflow PAT owned by the bot account');
  }

  private async readBotLogin(): Promise<string> {
    while (true) {
      const result = await this.terminal!.readText('Expected GitHub bot login (without @): ');
      if (result.kind !== 'value') throw new SetupTerminalCancelledError();
      const login = result.value.trim();
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
  ): Promise<string> {
    while (true) {
      const lines = choices.map((choice, index) =>
        `  ${index + 1}) ${choice}${choice === defaultValue ? color(' (default)', 90) : ''}`);
      const result = await this.terminal!.readText([
        label,
        ...lines,
        `Select 1-${choices.length}${defaultValue ? ` ${color(`[${choices.indexOf(defaultValue) + 1}]`, 90)}` : ''}: `,
      ].join('\n'));
      if (result.kind !== 'value') throw new SetupTerminalCancelledError();
      if (!result.value.trim() && defaultValue) return defaultValue;
      const index = Number(result.value) - 1;
      if (Number.isInteger(index) && choices[index]) return choices[index];
      console.log(color('Select one of the listed options.', 33));
    }
  }
}
