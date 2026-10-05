import { createDefaultSetupConfiguration, buildSetupPlan } from '../../application/policies/setup_configuration_policy';
import { buildDoctorReport, doctorCheck, skippedDoctorCheck } from '../../application/policies/setup_doctor_report_policy';
import type { TerminalDriver, TerminalReadResult } from '../../application/ports/setup_terminal_ports';
import { SetupPlanConfirmationAdapter, DryRunSetupPlanConfirmation } from '../setup_confirmation_adapter';
import { SetupCredentialPromptAdapter, SetupTerminalCancelledError } from '../setup_credential_prompt_adapter';
import { SetupDoctorPresenter, renderDoctorReport, doctorCheckLabel } from '../setup_doctor_presenter';
import { ConsoleSetupPlanPresenter, renderSetupPlan } from '../setup_plan_presenter';
import { ConsoleSetupQuestionRenderer } from '../setup_question_renderer';
import { SetupWorkflowUpdatePromptAdapter } from '../setup_workflow_update_prompt_adapter';
import { resolveStaticSetupDoctorCatalog } from '../../application/policies/setup_doctor_message_catalog';
import { setupEditableGroups } from '../../application/policies/setup_questionnaire_policy';

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

  it('distinguishes the first permission-intent pass from a deliberate second pass', () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      new ConsoleSetupQuestionRenderer('permission-intent').showIntroduction();
      expect(log.mock.calls.flat().join('\n')).toContain('later full wizard');
      log.mockClear();
      new ConsoleSetupQuestionRenderer('permission-intent', 2).showIntroduction();
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('Reviewing your setup choices again (pass 2)');
      expect(output).toContain('same setup run');
      expect(output).toContain('Press Enter to keep each answer');
      expect(output).toContain('return to the setup PAT permission review');
      expect(output).not.toContain('First, choose');
    } finally { log.mockRestore(); }
  });

  it('renders every doctor presentation label in the resolved repository locale', () => {
    const catalog = resolveStaticSetupDoctorCatalog('es-ES');
    const rendered = renderDoctorReport(buildDoctorReport([
      doctorCheck({
        id: 'credentials.setup-pat',
        status: 'fail',
        summary: catalog.message('doctor.setupPat.invalid'),
        action: catalog.message('doctor.setupPat.replaceAction'),
      }),
      skippedDoctorCheck(
        'github.variables',
        ['credentials.setup-pat'],
        catalog.message('doctor.skipped.variables'),
      ),
    ]), catalog);

    expect(rendered).toContain('Diagnóstico de Copilot — diagnóstico parcial');
    expect(rendered).toContain('FALLO');
    expect(rendered).toContain('OMITIDO');
    expect(rendered).toContain('Bloqueado por: credentials.setup-pat');
    expect(rendered).toContain('Acción: Sustituye el PAT de setup');
    expect(rendered).toContain('No se ha cambiado la configuración del repositorio.');
    expect(doctorCheckLabel('locale.repository', catalog)).toBe('Locale del repositorio');
  });

  it.each([
    ['configuration.valid', 'Configuration'],
    ['workspace.repository-root', 'Repository root'],
    ['credentials.setup-pat', 'Setup PAT'],
    ['github.resource-scopes', 'GitHub Actions scopes'],
    ['github.secret-names', 'Repository Secrets'],
    ['github.variables', 'Repository Variables'],
    ['github.merge-queue', 'Merge queue'],
    ['locale.profile', 'Locale profile'],
    ['locale.repository', 'Repository locale'],
    ['locale.issue', 'Issue locale'],
    ['locale.pull-request', 'Pull-request locale'],
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
    expect(renderer.renderPrompt({
      stateId: 'projects', id: 'projects.ids', label: 'Projects', kind: 'project-select', defaultValue: '',
    })).toContain('in text mode enter their URL numbers');
    expect(renderer.renderPrompt({
      stateId: 'capabilities', id: 'issueWorkflows.enabled', label: 'Issue workflows',
      kind: 'multi-select', defaultValue: '', choices: ['feature — Feature'],
    })).toContain('in text mode enter IDs');
    const help = renderer.renderHelp({
      stateId: 'agent-model-defaults', id: 'agents.findings.executable',
      label: 'Validated executable for all tasks', kind: 'text', defaultValue: '',
    });
    for (const heading of ['What:', 'When:', 'Where:', 'How:', 'Why:', 'Example:', 'Effect:', 'Verify:', 'Read more']) {
      expect(help).toContain(heading);
    }
    expect(help).toContain('https://docs.page/vypdev/copilot/agents/cli-configuration');
    const log = jest.spyOn(console, 'log').mockImplementation();
    renderer.showIntroduction();
    renderer.showState('capabilities');
    renderer.showValidation('Invalid.');
    renderer.showCancelled();
    expect(log).toHaveBeenCalledTimes(4);
    log.mockRestore();
  });

  it('shows full check identities, bounded discovery evidence, and Project Status warnings', () => {
    const renderer = new ConsoleSetupQuestionRenderer();
    const coverage = renderer.renderPrompt({ stateId: 'pull-request-approval', id: 'pullRequestApproval.coverage.checkName',
      label: 'Coverage check', kind: 'choice', defaultValue: 'coverage', choices: ['coverage', 'other'],
      trustedProducers: [{ name: 'coverage', sourceAppId: 42, workflowName: 'CI' }] });
    expect(coverage).toContain('coverage — CI · App 42');
    const checks = renderer.renderPrompt({ stateId: 'pull-request-approval', id: 'pullRequestApproval.testChecks',
      label: 'Trusted checks', kind: 'producer-select', defaultValue: '', discoveryStatus: 'observed',
      discoveryTruncated: true, discoveryRetryRemaining: 1,
      producerCandidates: [{ name: 'tests', sourceAppId: 42, workflowName: 'CI', conclusion: 'success',
        headSha: 'abcdef123', runUrl: 'https://github.com/owner/repo/actions/runs/1',
        requiredByRuleset: { branch: 'develop', sourceUrl: 'https://github.com/owner/repo/rules/1' } }] });
    expect(checks).toContain('tests · App 42 · CI · success · abcdef1');
    expect(checks).toContain('Required on develop by active ruleset');
    expect(checks).toContain('Only a bounded sample was inspected');
    expect(checks).toContain('Type r to retry GitHub discovery');
    const projects = renderer.renderPrompt({ stateId: 'projects', id: 'projects.ids', label: 'Projects',
      kind: 'project-select', defaultValue: '', discoveryStatus: 'empty' });
    expect(projects).toContain('no open, accessible Projects');
    expect(projects).toContain('at most 30 open, accessible organization Projects');
    const status = renderer.renderPrompt({ stateId: 'projects', id: 'projects.issueCreatedColumn', label: 'Status',
      kind: 'text', defaultValue: 'Todo', statusOptionState: 'unavailable',
      projectStatusValues: [{ transition: 'issueCreated', value: 'Todo' }] });
    expect(status).toContain('Verify these exact Status values');
    expect(status).toContain('Status options could not be verified');
    expect(renderer.renderPrompt({ stateId: 'projects', id: 'projects.issueCreatedColumn', label: 'Status',
      kind: 'text', defaultValue: 'Todo', statusOptionState: 'incompatible' })).toContain('no common Status values');
    const log = jest.spyOn(console, 'log').mockImplementation();
    renderer.showHelp({ stateId: 'projects', id: 'projects.ids', label: 'Projects', kind: 'project-select', defaultValue: '' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('About this setup choice'));
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

  it('explains final Apply on ? and re-asks without approving it', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const input = terminal([{ kind: 'value', value: '?' }, { kind: 'value', value: 'no' }]);
      await expect(new SetupPlanConfirmationAdapter(input, false).confirm(buildSetupPlan(createDefaultSetupConfiguration())))
        .resolves.toEqual({ kind: 'declined' });
      expect(input.readText).toHaveBeenCalledTimes(2);
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('This is the final approval');
      expect(output).toContain('PATs created on GitHub are not deleted automatically');
      expect(output).toContain('https://docs.page/vypdev/copilot/how-to-use');
    } finally { log.mockRestore(); }
  });

  it('lists editable plan sections, rejects an invalid number, and returns the chosen group', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const plan = buildSetupPlan(createDefaultSetupConfiguration());
      const input = terminal([{ kind: 'value', value: ':edit' }, { kind: 'value', value: '99' },
        { kind: 'value', value: ':edit' }, { kind: 'value', value: '1' }]);
      await expect(new SetupPlanConfirmationAdapter(input, false).confirm(plan))
        .resolves.toEqual({ kind: 'revise', group: setupEditableGroups(plan.configuration)[0] });
      expect(log.mock.calls.flat().join('\n')).toContain('Choose one of the listed section numbers');
    } finally { log.mockRestore(); }
  });

  it('cancels rather than applying when section selection is interrupted', async () => {
    const input = terminal([{ kind: 'value', value: ':edit' }, { kind: 'end-of-input' }]);
    await expect(new SetupPlanConfirmationAdapter(input, false).confirm(buildSetupPlan(createDefaultSetupConfiguration())))
      .resolves.toEqual({ kind: 'cancelled' });
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

  it('requires explicit acknowledgement for unverifiable required write permissions', async () => {
    const report = {
      role: 'workflow' as const,
      identityStatus: 'valid' as const,
      identityMessage: 'verified',
      ready: false,
      confirmationRequired: true,
      checks: [{
        id: 'workflow.repository.contents', role: 'workflow' as const, scope: 'repository' as const,
        permission: 'Contents', level: 'write' as const, applicability: 'required' as const,
        reason: 'Manage branches.', probe: 'contents' as const,
        status: 'unverifiable' as const, message: 'no safe write proof',
      }],
    };
    const log = jest.spyOn(console, 'log').mockImplementation();

    await expect(new SetupCredentialPromptAdapter(terminal([
      { kind: 'value', value: 'maybe' },
      { kind: 'value', value: 'yes' },
    ]), {}).confirmUnverifiableTokenPermissions(report)).resolves.toBe(true);
    await expect(new SetupCredentialPromptAdapter(
      terminal([{ kind: 'value', value: '' }]),
      {},
    ).confirmUnverifiableTokenPermissions(report)).resolves.toBe(false);
    await expect(new SetupCredentialPromptAdapter(
      undefined,
      {},
      true,
    ).confirmUnverifiableTokenPermissions(report)).resolves.toBe(true);
    await expect(new SetupCredentialPromptAdapter(
      terminal([{ kind: 'cancel' }]),
      {},
    ).confirmUnverifiableTokenPermissions(report)).rejects.toBeInstanceOf(SetupTerminalCancelledError);
    await expect(new SetupCredentialPromptAdapter(undefined, {}, true)
      .confirmUnverifiableTokenPermissions({ ...report, confirmationRequired: false }))
      .resolves.toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('workflow-token');
    log.mockRestore();
  });

  it('does not let the write-only CLI flag auto-confirm an unverified Projects read', async () => {
    const report = {
      role: 'setup' as const, identityStatus: 'valid' as const, identityMessage: 'checked',
      ready: false, confirmationRequired: true,
      checks: [{ id: 'setup.organization.projects', role: 'setup' as const,
        scope: 'organization' as const, permission: 'Projects', level: 'read' as const,
        applicability: 'required' as const, reason: 'Inspect Projects', probe: 'projects' as const,
        status: 'unverifiable' as const, publicReadEvidence: 'public-organization-projects' as const,
        message: 'Public list does not prove the grant' }],
    };
    await expect(new SetupCredentialPromptAdapter(undefined, {}, true)
      .confirmUnverifiableTokenPermissions(report)).resolves.toBe(false);
    await expect(new SetupCredentialPromptAdapter(terminal([{ kind: 'value', value: 'yes' }]), {}, true)
      .confirmUnverifiableTokenPermissions(report)).resolves.toBe(true);
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

  it('guides setup PAT creation, confirms the authenticated account, and gives an honest cleanup reminder', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const input = terminal([
        { kind: 'value', value: '' },
        { kind: 'value', value: 'setup-token' },
        { kind: 'value', value: '' },
      ]);
      const adapter = new SetupCredentialPromptAdapter(input, {});
      adapter.configureSetupPatGuide('https://github.com/settings/personal-access-tokens/new?expires_in=1');
      await expect(adapter.requestSetupPat()).resolves.toBe('setup-token');
      await expect(adapter.confirmGuidedSetupAccount('operator')).resolves.toBe(true);
      adapter.showSetupPatCleanupReminder();
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('https://github.com/settings/personal-access-tokens/new?expires_in=1');
      expect(output).toContain('Provisional');
      expect(output).toContain('@operator');
      expect(output).toContain('not revoked automatically');
      expect(output).not.toContain('setup-token');
      expect(input.readSecret).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });

  it('keeps missing-terminal setup choices on the manual path', async () => {
    const adapter = new SetupCredentialPromptAdapter(undefined, {});
    await expect(adapter.chooseSetupPatMethod()).resolves.toBe('manual');
    await expect(adapter.chooseSetupOwnerKind()).resolves.toBe('unknown');
    await expect(adapter.reviewSetupPatIntent()).resolves.toBe('manual');
    await expect(adapter.requestSetupPat()).resolves.toBeUndefined();
    await expect(adapter.confirmGuidedSetupAccount()).resolves.toBe(true);
  });

  it.each([
    ['1', 'Organization'], ['2', 'User'], ['3', 'unknown'],
  ] as const)('requires an explicit owner-kind selection %s', async (selection, expected) => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const input = terminal([{ kind: 'value', value: '' }, { kind: 'value', value: selection }]);
      await expect(new SetupCredentialPromptAdapter(input, {}).chooseSetupOwnerKind()).resolves.toBe(expected);
      expect(input.readText).toHaveBeenCalledTimes(2);
    } finally { log.mockRestore(); }
  });

  it('opens credential choice help with ? and then asks the same unanswered question', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const input = terminal([{ kind: 'value', value: '?' }, { kind: 'value', value: '2' }]);
      await expect(new SetupCredentialPromptAdapter(input, {}).chooseSetupOwnerKind()).resolves.toBe('User');
      expect(input.readText).toHaveBeenCalledTimes(2);
      expect(String(input.readText.mock.calls[0][0])).toContain('Type ? for more detail');
      expect(log.mock.calls.flat().join('\n')).toContain('owner/repository');
      expect(log.mock.calls.flat().join('\n')).toContain('https://docs.page/vypdev/copilot/authentication');
    } finally { log.mockRestore(); }
  });

  it('explains a bot login on ? without treating it as an account', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const input = terminal([
        { kind: 'value', value: '1' }, { kind: 'value', value: '?' },
        { kind: 'value', value: 'vypbot' }, { kind: 'value', value: 'bot-token' },
      ]);
      const adapter = new SetupCredentialPromptAdapter(input, {});
      adapter.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new', async login => ({ login, id: 123 }));
      await expect(adapter.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'runtime' }))
        .resolves.toEqual({ name: 'PAT', value: 'bot-token' });
      expect(log.mock.calls.flat().join('\n')).toContain('numeric account ID');
      expect(input.readText).toHaveBeenCalledTimes(3);
    } finally { log.mockRestore(); }
  });

  it('reviews intent explicitly, supports revision, and can fall back to manual input', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const input = terminal([
        { kind: 'value', value: '1' },
        { kind: 'value', value: '2' },
        { kind: 'value', value: '4' },
        { kind: 'value', value: 'manual-token' },
      ]);
      const adapter = new SetupCredentialPromptAdapter(input, {});
      await expect(adapter.chooseSetupPatMethod()).resolves.toBe('guided');
      await expect(adapter.reviewSetupPatIntent()).resolves.toBe('revise');
      await expect(adapter.reviewSetupPatIntent()).resolves.toBe('manual');
      adapter.configureSetupPatGuide('https://github.com/settings/personal-access-tokens/new');
      adapter.useManualSetupPat();
      await expect(adapter.requestSetupPat()).resolves.toBe('manual-token');
      adapter.showSetupPatCleanupReminder();
      expect(adapter.usedGuidedSetupPat).toBe(false);
      expect(log.mock.calls.flat().join('\n')).not.toContain('Revoke temporary setup PAT');
    } finally { log.mockRestore(); }
  });

  it('offers the full setup permission table as a review action', async () => {
    const input = terminal([{ kind: 'value', value: '3' }]);
    await expect(new SetupCredentialPromptAdapter(input, {}).reviewSetupPatIntent()).resolves.toBe('details');
    expect(input.readText).toHaveBeenCalledWith(expect.stringContaining('view full permission table'));
  });

  it('lists PAT review actions in the same order as the numbered menu', async () => {
    const input = terminal([{ kind: 'value', value: '3' }]);
    await new SetupCredentialPromptAdapter(input, {}).reviewSetupPatIntent();
    const prompt = String(input.readText.mock.calls[0][0]);
    expect(prompt).toMatch(/1\) continue to GitHub[\s\S]*2\) review all setup choices again[\s\S]*3\) view full permission table[\s\S]*4\) enter a PAT manually/u);
  });

  it('rejects an invalid authenticated setup account without prompting', async () => {
    const input = terminal([{ kind: 'value', value: '1' }]);
    const adapter = new SetupCredentialPromptAdapter(input, {});
    await adapter.chooseSetupPatMethod();
    await expect(adapter.confirmGuidedSetupAccount('bad/account')).resolves.toBe(false);
    expect(input.readText).toHaveBeenCalledTimes(1);
  });

  it('keeps manual setup PAT choice free of link and cleanup claims', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const adapter = new SetupCredentialPromptAdapter(terminal([
        { kind: 'value', value: '2' },
        { kind: 'value', value: 'manual-token' },
      ]), {});
      adapter.configureSetupPatGuide('https://github.com/settings/personal-access-tokens/new');
      await expect(adapter.requestSetupPat()).resolves.toBe('manual-token');
      adapter.showSetupPatCleanupReminder();
      const output = log.mock.calls.flat().join('\n');
      expect(output).not.toContain('https://github.com/settings/personal-access-tokens/new');
      expect(output).not.toContain('not revoked automatically');
    } finally { log.mockRestore(); }
  });

  it('distinguishes an initial PAT failure from a blocked final plan', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const adapter = new SetupCredentialPromptAdapter(terminal([
        { kind: 'value', value: '1' }, { kind: 'value', value: 'setup-token' },
      ]), {});
      adapter.configureSetupPatGuide('https://github.com/settings/personal-access-tokens/new');
      await adapter.requestSetupPat();
      log.mockClear();
      adapter.showUpdatedSetupPatLink('https://github.com/settings/personal-access-tokens/new?contents=read', 'bootstrap');
      expect(log.mock.calls.flat().join('\n')).toContain('no setup plan has been applied');
      log.mockClear();
      adapter.showUpdatedSetupPatLink('https://github.com/settings/personal-access-tokens/new?contents=write', 'final');
      expect(log.mock.calls.flat().join('\n')).toContain('no plan mutation has started');
      log.mockClear();
      adapter.showUpdatedSetupPatLink('https://github.com/settings/personal-access-tokens/new?contents=write', 'final', ['repository Contents write']);
      expect(log.mock.calls.flat().join('\n')).toContain('repository Contents write');
    } finally { log.mockRestore(); }
  });

  it('does not show a correction link before guided mode is selected', () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      new SetupCredentialPromptAdapter(undefined, {}).showUpdatedSetupPatLink('https://github.com/settings/personal-access-tokens/new', 'final');
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it('rejects an unintended setup account before continuing', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const adapter = new SetupCredentialPromptAdapter(terminal([
        { kind: 'value', value: '1' },
        { kind: 'value', value: 'setup-token' },
        { kind: 'value', value: '2' },
      ]), {});
      adapter.configureSetupPatGuide('https://github.com/settings/personal-access-tokens/new');
      await adapter.requestSetupPat();
      await expect(adapter.confirmGuidedSetupAccount('wrong-account')).resolves.toBe(false);
    } finally { log.mockRestore(); }
  });

  it('resolves the intended bot ID before accepting a guided workflow PAT', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const input = terminal([
        { kind: 'value', value: '' },
        { kind: 'value', value: 'bad/login' },
        { kind: 'value', value: 'vypbot' },
        { kind: 'value', value: 'bot-token' },
      ]);
      const resolve = jest.fn(async () => ({ id: 42, login: 'vypbot' }));
      const adapter = new SetupCredentialPromptAdapter(input, {});
      adapter.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new?expires_in=90', resolve);
      const requirement = { name: 'PAT', kind: 'workflowPat' as const, description: 'Runtime token' };
      await expect(adapter.requestWorkflowPat(requirement)).resolves.toEqual({ name: 'PAT', value: 'bot-token' });
      expect(resolve).toHaveBeenCalledWith('vypbot');
      expect(adapter.guidedWorkflowBotIdentity).toEqual({ id: 42, login: 'vypbot' });
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('GitHub account ID 42');
      expect(output).toContain('https://github.com/settings/personal-access-tokens/new?expires_in=90');
      expect(output).not.toContain('bot-token');
    } finally { log.mockRestore(); }
  });

  it('shows bot permission details on demand without asking for the bot identity twice', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const input = terminal([
        { kind: 'value', value: '3' },
        { kind: 'value', value: '1' },
        { kind: 'value', value: 'vypbot' },
        { kind: 'value', value: 'bot-token' },
      ]);
      const resolve = jest.fn(async () => ({ id: 42, login: 'vypbot' }));
      const adapter = new SetupCredentialPromptAdapter(input, {});
      adapter.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new', resolve, [{
        id: 'workflow.repository.contents', role: 'workflow', scope: 'repository', permission: 'Contents',
        level: 'write', applicability: 'required', reason: 'Manage branches.', probe: 'contents',
      }]);
      await expect(adapter.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'Runtime token' }))
        .resolves.toEqual({ name: 'PAT', value: 'bot-token' });
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(input.readText.mock.calls.filter(([prompt]) => String(prompt).includes('Expected GitHub bot login'))).toHaveLength(1);
      expect(log.mock.calls.flat().join('\n')).toContain('Workflow PAT permissions required');
    } finally { log.mockRestore(); }
  });

  it('propagates cancellation before a bot login can be resolved', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const adapter = new SetupCredentialPromptAdapter(terminal([
        { kind: 'value', value: '1' }, { kind: 'cancel' },
      ]), {});
      adapter.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new', jest.fn());
      await expect(adapter.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'Runtime token' }))
        .rejects.toBeInstanceOf(SetupTerminalCancelledError);
    } finally { log.mockRestore(); }
  });

  it('manual bot PAT entry does not assert a guided bot identity', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const adapter = new SetupCredentialPromptAdapter(terminal([
        { kind: 'value', value: '2' }, { kind: 'value', value: 'manual-bot-token' },
      ]), {});
      const resolve = jest.fn();
      adapter.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new', resolve, [{
        id: 'workflow.repository.contents', role: 'workflow', scope: 'repository', permission: 'Contents',
        level: 'write', applicability: 'required', reason: 'Manage branches.', probe: 'contents',
      }]);
      await expect(adapter.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'Runtime token' }))
        .resolves.toEqual({ name: 'PAT', value: 'manual-bot-token' });
      expect(resolve).not.toHaveBeenCalled();
      expect(adapter.guidedWorkflowBotIdentity).toBeUndefined();
      expect(log.mock.calls.flat().join('\n')).toContain('Workflow PAT permissions required');
    } finally { log.mockRestore(); }
  });

  it('does not invent workflow PAT requirements when the manual guide has none', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    try {
      const adapter = new SetupCredentialPromptAdapter(terminal([
        { kind: 'value', value: '2' }, { kind: 'value', value: 'manual-bot-token' },
      ]), {});
      adapter.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new', async () => ({ login: 'bot', id: 1 }));
      await expect(adapter.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'Runtime token' }))
        .resolves.toEqual({ name: 'PAT', value: 'manual-bot-token' });
      expect(log.mock.calls.flat().join('\n')).not.toContain('Workflow PAT permissions required');
    } finally { log.mockRestore(); }
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
