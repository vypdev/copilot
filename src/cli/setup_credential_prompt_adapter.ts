import type { TerminalDriver } from '../application/ports/setup_terminal_ports';
import type { SetupCredentialPromptPort } from '../application/ports/setup_wizard_ports';
import type {
  SetupCredentialCheck,
  SetupCredentialDecision,
  SetupCredentialRequirement,
  SetupCredentialValue,
} from '../domain/setup';
import { color, renderBox, statusIcon } from './setup_prompt_rendering';

export class SetupTerminalCancelledError extends Error {
  constructor() {
    super('Setup input was cancelled.');
    this.name = 'SetupTerminalCancelledError';
  }
}

export class SetupCredentialPromptAdapter implements SetupCredentialPromptPort {
  constructor(
    private readonly terminal: TerminalDriver | undefined,
    private readonly credentialValues: Readonly<Record<string, string>>,
  ) {}

  async requestSetupPat(): Promise<string | undefined> {
    if (!this.terminal) return undefined;
    console.log(renderBox(
      'Enter a GitHub setup PAT. It is used in memory for this run only and is never stored. The workflow PAT is a different bot-account token and is requested separately.',
      'Setup PAT',
      33,
    ));
    return this.readSecret('Setup PAT');
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

  requestWorkflowPat(
    requirement: SetupCredentialRequirement,
    current?: SetupCredentialCheck,
  ): Promise<SetupCredentialValue | undefined> {
    return this.requestSecretForRequirement(requirement, current, 'workflow PAT owned by the bot account');
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
    defaultValue: string,
  ): Promise<string> {
    while (true) {
      const lines = choices.map((choice, index) =>
        `  ${index + 1}) ${choice}${choice === defaultValue ? color(' (default)', 90) : ''}`);
      const result = await this.terminal!.readText([
        label,
        ...lines,
        `Select 1-${choices.length} ${color(`[${choices.indexOf(defaultValue) + 1}]`, 90)}: `,
      ].join('\n'));
      if (result.kind !== 'value') throw new SetupTerminalCancelledError();
      if (!result.value.trim()) return defaultValue;
      const index = Number(result.value) - 1;
      if (Number.isInteger(index) && choices[index]) return choices[index];
      console.log(color('Select one of the listed options.', 33));
    }
  }
}
