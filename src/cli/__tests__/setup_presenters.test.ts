import { createDefaultSetupConfiguration, buildSetupPlan } from '../../application/policies/setup_configuration_policy';
import { buildDoctorReport, doctorCheck, skippedDoctorCheck } from '../../application/policies/setup_doctor_report_policy';
import type { TerminalDriver, TerminalReadResult } from '../../application/ports/setup_terminal_ports';
import { SetupPlanConfirmationAdapter, DryRunSetupPlanConfirmation } from '../setup_confirmation_adapter';
import { SetupCredentialPromptAdapter, SetupTerminalCancelledError } from '../setup_credential_prompt_adapter';
import { SetupDoctorPresenter, renderDoctorReport, doctorCheckLabel } from '../setup_doctor_presenter';
import { ConsoleSetupPlanPresenter, renderSetupPlan } from '../setup_plan_presenter';
import { ConsoleSetupQuestionRenderer } from '../setup_question_renderer';
import { SetupWorkflowUpdatePromptAdapter } from '../setup_workflow_update_prompt_adapter';

function terminal(results: readonly TerminalReadResult[]): jest.Mocked<TerminalDriver> {
  let index = 0;
  return {
    isInteractive: jest.fn(() => true),
    readText: jest.fn(async (_prompt: string) => results[index++] ?? { kind: 'end-of-input' }),
    readSecret: jest.fn(async (_prompt: string) => results[index++] ?? { kind: 'end-of-input' }),
    close: jest.fn(),
  };
}

describe('setup presenters and prompt-specific adapters', () => {
  it('renders complete and partial doctor reports with text statuses and the no-write guarantee', () => {
    const complete = renderDoctorReport(buildDoctorReport([
      doctorCheck({ id: 'configuration.valid', status: 'pass', summary: 'Valid.' }),
    ]));
    const partial = renderDoctorReport(buildDoctorReport([
      doctorCheck({ id: 'credentials.setup-pat', status: 'fail', summary: 'Rejected.', action: 'Replace it.' }),
      skippedDoctorCheck('github.variables', ['credentials.setup-pat'], 'Blocked.'),
    ]));

    expect(complete).toContain('PASS');
    expect(complete).toContain('No repository configuration was changed.');
    expect(partial).toContain('partial diagnosis');
    expect(partial).toContain('SKIP');
    expect(partial).toContain('Blocked by: credentials.setup-pat');
    expect(partial).toContain('Action: Replace it.');
    const log = jest.spyOn(console, 'log').mockImplementation();
    new SetupDoctorPresenter().present(buildDoctorReport([
      doctorCheck({ id: 'configuration.valid', status: 'pass', summary: 'Valid.' }),
    ]));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Copilot Doctor'));
    log.mockRestore();
  });

  it.each([
    ['configuration.valid', 'Configuration'],
    ['workspace.repository-root', 'Repository root'],
    ['credentials.setup-pat', 'Setup PAT'],
    ['github.resource-scopes', 'GitHub Actions scopes'],
    ['github.secret-names', 'Repository Secrets'],
    ['github.variables', 'Repository Variables'],
    ['github.merge-queue', 'Merge queue'],
    ['workflow.release-yml', 'Workflow release-yml'],
    ['github.variables.agent-provider', 'Variable AGENT_PROVIDER'],
    ['credential.openai-api-key', 'Credential OPENAI_API_KEY'],
    ['github.merge-queue.production', 'Merge queue production'],
    ['custom.check', 'custom.check'],
  ])('maps doctor check ID %s to %s', (id, expected) => {
    expect(doctorCheckLabel(id)).toBe(expected);
  });

  it('renders a setup plan without exposing credential values', () => {
    const configuration = createDefaultSetupConfiguration();
    const plan = buildSetupPlan(configuration, [
      doctorCheck({ id: 'github.merge-queue.production', status: 'warn', summary: 'Review queue.' }),
    ]);
    const rendered = renderSetupPlan(plan);
    expect(rendered).toContain('Setup Plan');
    expect(rendered).toContain('Capabilities');
    expect(rendered).toContain('Strictly required Secrets');
    expect(rendered).toContain('Merge queue readiness');
    expect(rendered).not.toContain('workflow-token-value');
    const log = jest.spyOn(console, 'log').mockImplementation();
    new ConsoleSetupPlanPresenter().present(plan);
    expect(log).toHaveBeenCalledWith(rendered);
    log.mockRestore();
  });

  it('renders bounded choices, defaults, and scope candidates independently of terminal I/O', () => {
    const renderer = new ConsoleSetupQuestionRenderer();
    expect(renderer.renderPrompt({
      stateId: 'agent-runtime',
      id: 'agents.planner.provider',
      label: 'Planner runtime',
      kind: 'choice',
      choices: ['codex', 'cursor'],
      defaultValue: 'codex',
    })).toContain('1) codex');
    expect(renderer.renderPrompt({
      stateId: 'storage',
      id: 'storage.secrets.overrides',
      label: 'Overrides',
      kind: 'scope-overrides',
      allowedNames: ['PAT'],
      defaultValue: '',
    })).toContain('Available: PAT');
    expect(renderer.renderPrompt({
      stateId: 'capabilities',
      id: 'features.release',
      label: 'Release',
      kind: 'boolean',
      defaultValue: true,
    })).toContain('[Y]');
    const log = jest.spyOn(console, 'log').mockImplementation();
    renderer.showIntroduction();
    renderer.showState('capabilities');
    renderer.showValidation('Invalid.');
    renderer.showCancelled();
    expect(log).toHaveBeenCalledTimes(4);
    log.mockRestore();
  });

  it('distinguishes approval, decline, and interrupted confirmation', async () => {
    const input = terminal([
      { kind: 'value', value: 'maybe' },
      { kind: 'value', value: 'yes' },
      { kind: 'value', value: '' },
      { kind: 'cancel' },
    ]);
    const plan = buildSetupPlan(createDefaultSetupConfiguration());
    await expect(new SetupPlanConfirmationAdapter(input, false).confirm(plan)).resolves.toEqual({ kind: 'approved' });
    await expect(new SetupPlanConfirmationAdapter(input, false).confirm(plan)).resolves.toEqual({ kind: 'declined' });
    await expect(new SetupPlanConfirmationAdapter(input, false).confirm(plan)).resolves.toEqual({ kind: 'cancelled' });
    await expect(new SetupPlanConfirmationAdapter(undefined, true).confirm(plan)).resolves.toEqual({ kind: 'approved' });
    await expect(new SetupPlanConfirmationAdapter(undefined, false).confirm(plan)).resolves.toEqual({ kind: 'declined' });
    await expect(new DryRunSetupPlanConfirmation().confirm(plan)).resolves.toEqual({ kind: 'approved' });
  });

  it('keeps non-interactive credential values separate from questionnaire and plan state', async () => {
    const adapter = new SetupCredentialPromptAdapter(undefined, { PAT: 'workflow-token' });
    const requirement = { name: 'PAT', kind: 'workflowPat' as const, description: 'Runtime token' };
    await expect(adapter.requestSetupPat()).resolves.toBeUndefined();
    await expect(adapter.requestWorkflowPat(requirement)).resolves.toEqual({ name: 'PAT', value: 'workflow-token' });
    await expect(adapter.chooseExistingCredential(requirement, {
      name: 'PAT',
      status: 'unverifiable',
      message: 'Unknown.',
    })).resolves.toBe('replace');
    await expect(adapter.requestApiKey({
      name: 'MISSING',
      kind: 'apiKey',
      description: 'Missing',
    })).resolves.toBeUndefined();
    adapter.explainCredentialSeparation([]);
    adapter.showCredentialChecks([]);
  });

  it('collects hidden setup and runtime credentials without rendering their values', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    const setupInput = terminal([{ kind: 'value', value: 'setup-token' }]);
    await expect(new SetupCredentialPromptAdapter(setupInput, {}).requestSetupPat()).resolves.toBe('setup-token');

    const requirement = { name: 'OPENAI_API_KEY', kind: 'apiKey' as const, description: 'OpenAI', provider: 'openai' };
    const runtimeInput = terminal([{ kind: 'value', value: 'api-key' }]);
    const adapter = new SetupCredentialPromptAdapter(runtimeInput, {});
    adapter.explainCredentialSeparation([requirement]);
    await expect(adapter.requestApiKey(requirement, {
      name: requirement.name,
      status: 'unverifiable',
      message: 'Unknown.',
    })).resolves.toEqual({ name: requirement.name, value: 'api-key' });
    adapter.showCredentialChecks([
      { name: 'PAT', status: 'valid', message: 'Valid.' },
      { name: requirement.name, status: 'invalid', message: 'Invalid.' },
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('api-key');
    log.mockRestore();
  });

  it('supports explicit existing-credential choices and propagates interrupted secret input', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    const requirement = { name: 'PAT', kind: 'workflowPat' as const, description: 'Runtime token' };
    const choiceInput = terminal([
      { kind: 'value', value: 'invalid' },
      { kind: 'value', value: '2' },
    ]);
    await expect(new SetupCredentialPromptAdapter(choiceInput, {}).chooseExistingCredential(requirement, {
      name: 'PAT',
      status: 'invalid',
      message: 'Invalid.',
    })).resolves.toBe('replace');
    await expect(new SetupCredentialPromptAdapter(terminal([{ kind: 'cancel' }]), {}).requestWorkflowPat(requirement))
      .rejects.toBeInstanceOf(SetupTerminalCancelledError);
    await expect(new SetupCredentialPromptAdapter(terminal([{ kind: 'value', value: '' }]), {}).requestWorkflowPat(requirement))
      .resolves.toBeUndefined();
    log.mockRestore();
  });

  it('requires an explicit workflow update flag when no terminal exists', async () => {
    const adapter = new SetupWorkflowUpdatePromptAdapter(undefined);
    const changed = [{ file: 'release.yml', destination: '.github/workflows/release.yml', status: 'changed' as const }];
    await expect(adapter.confirmWorkflowUpdates(changed, false)).resolves.toBe(false);
    await expect(adapter.confirmWorkflowUpdates(changed, true)).resolves.toBe(true);
    await expect(adapter.confirmWorkflowUpdates([], true)).resolves.toBe(false);
  });

  it('handles interactive workflow-update approval, rejection, validation, and interruption', async () => {
    const changed = [{ file: 'release.yml', destination: '.github/workflows/release.yml', status: 'unmanaged' as const }];
    const log = jest.spyOn(console, 'log').mockImplementation();
    await expect(new SetupWorkflowUpdatePromptAdapter(terminal([
      { kind: 'value', value: 'maybe' },
      { kind: 'value', value: 'yes' },
    ])).confirmWorkflowUpdates(changed, false)).resolves.toBe(true);
    await expect(new SetupWorkflowUpdatePromptAdapter(terminal([
      { kind: 'value', value: '' },
    ])).confirmWorkflowUpdates(changed, false)).resolves.toBe(false);
    await expect(new SetupWorkflowUpdatePromptAdapter(terminal([])).confirmWorkflowUpdates(changed, true)).resolves.toBe(true);
    await expect(new SetupWorkflowUpdatePromptAdapter(terminal([
      { kind: 'end-of-input' },
    ])).confirmWorkflowUpdates(changed, false)).rejects.toBeInstanceOf(SetupTerminalCancelledError);
    log.mockRestore();
  });
});
