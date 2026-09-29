import { WebSetupBridge } from '../web_setup_bridge';
import { WebSetupCredentialPrompt, WebSetupJourneyPresenter, WebSetupPermissionPresenter, WebSetupPlanConfirmation, WebSetupPlanPresenter, WebSetupQuestionnaireCollector, WebSetupWorkflowUpdatePrompt } from '../web_setup_adapters';
import { buildInitialSetupConfiguration } from '../../application/usecases/setup/setup_wizard_use_case';
import { createSetupPermissionIntentQuestionnaire, createSetupQuestionnaire, setupQuestionContentInventory } from '../../application/policies/setup_questionnaire_policy';
import type { SetupPlan } from '../../domain/setup';
import type { SetupTokenPermissionReport } from '../../domain/setup_token_permissions';
import type { SetupCredentialCheck } from '../../domain/setup';

const next = () => new Promise<void>(resolve => setImmediate(resolve));

function answer(bridge: WebSetupBridge, value: string): void {
  const revision = bridge.snapshot().promptRevision;
  expect(revision).toBeDefined();
  expect(bridge.answer(revision!, value)).toBe(true);
}

const emptyPlan = (): SetupPlan => ({
  configuration: buildInitialSetupConfiguration({ mode: 'interactive' }),
  workflowFiles: ['copilot.yml'], issueTemplateFiles: [], selectedFiles: ['.github/workflows/copilot.yml'],
  variables: [{ name: 'AGENT_PROVIDER', value: 'codex' }], requiredSecrets: ['PAT'], credentialRequirements: [],
  mergeQueueReadiness: [], approvalReadiness: [], warnings: ['Review changes'],
});

describe('semantic web setup adapters', () => {
  test('collects policy-owned intent questions without terminal prompt parsing', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const collector = new WebSetupQuestionnaireCollector(bridge);
    const initial = createSetupPermissionIntentQuestionnaire(buildInitialSetupConfiguration({ mode: 'interactive' }));
    const result = collector.collect(initial, {});
    const seen: string[] = [];
    for (let index = 0; index < 30; index += 1) {
      const prompt = bridge.snapshot().prompt;
      if (!prompt) break;
      expect(prompt.kind).toBe('question');
      if (prompt.kind === 'question') seen.push(prompt.question.id);
      answer(bridge, '');
      await next();
    }
    const state = await result;
    expect(state.terminal).toBe('review');
    expect(seen).toContain('features.issues');
    expect(state.answeredQuestionIds).toEqual(seen);
    expect(JSON.stringify(bridge.snapshot())).not.toContain('github_pat_');
  });

  test('labels a legacy questionnaire without a phase as the full wizard', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const ask = jest.spyOn(bridge, 'ask').mockResolvedValueOnce(undefined);
    const initial = createSetupPermissionIntentQuestionnaire(buildInitialSetupConfiguration({ mode: 'interactive' }));
    const result = await new WebSetupQuestionnaireCollector(bridge).collect({ ...initial, phase: undefined }, {});
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ phase: 'full', pass: 1 }), undefined, expect.any(Function));
    expect(result.terminal).toBe('cancelled');
  });

  test('invalid answer stays on the same policy question and exposes validation', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const collector = new WebSetupQuestionnaireCollector(bridge);
    const result = collector.collect(createSetupPermissionIntentQuestionnaire(buildInitialSetupConfiguration({ mode: 'interactive' })), {});
    const firstPrompt = bridge.snapshot().prompt;
    const initialId = firstPrompt?.kind === 'question' ? firstPrompt.question.id : '';
    answer(bridge, 'not-yes-or-no');
    await next();
    expect(bridge.snapshot().prompt?.kind).toBe('question');
    const retryPrompt = bridge.snapshot().prompt;
    expect(retryPrompt?.kind === 'question' && retryPrompt.question.id).toBe(initialId);
    expect(bridge.snapshot().message?.text).toContain('Enter yes or no');
    bridge.cancel();
    expect((await result).terminal).toBe('cancelled');
  });

  test('a web discovery retry refreshes the current Project question without restarting the questionnaire', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id).filter(id => id !== 'projects.ids'),
      projectOwner: 'owner', projectDiscovery: { status: 'unavailable' as const, candidates: [] },
      discoveryRetryRemaining: { checks: 0, projects: 1 } };
    const initial = createSetupQuestionnaire(buildInitialSetupConfiguration({ mode: 'interactive' }), context);
    const refreshed = { ...context, projectDiscovery: { status: 'observed' as const, candidates: [
      { number: 5, owner: 'owner', title: 'Roadmap', url: 'https://github.com/orgs/owner/projects/5' },
    ] }, discoveryRetryRemaining: { checks: 0, projects: 0 } };
    const refresh = jest.fn(async () => refreshed);
    const pending = new WebSetupQuestionnaireCollector(bridge).collect(initial, context, { refresh });
    const revision = bridge.snapshot().promptRevision!;
    expect(await bridge.retryDiscovery(revision)).toBe('updated');
    expect(refresh).toHaveBeenCalledWith('projects');
    const prompt = bridge.snapshot().prompt;
    expect(prompt?.kind).toBe('question');
    if (prompt?.kind === 'question') expect(prompt.question.projectCandidates?.[0].title).toBe('Roadmap');
    answer(bridge, '5');
    expect((await pending).draft.projects.ids).toBe('5');
  });

  test('back navigation shows the earlier web question within the same run', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const initial = createSetupPermissionIntentQuestionnaire(buildInitialSetupConfiguration({ mode: 'interactive' }));
    const firstId = initial.question?.id;
    const pending = new WebSetupQuestionnaireCollector(bridge).collect(initial, {});
    answer(bridge, '');
    await next();
    expect(bridge.snapshot().prompt?.kind).toBe('question');
    expect(bridge.snapshot().promptRevision).toBeGreaterThan(1);
    expect(bridge.back(bridge.snapshot().promptRevision!)).toBe('updated');
    const returned = bridge.snapshot().prompt;
    expect(returned?.kind === 'question' && returned.question.id).toBe(firstId);
    bridge.cancel();
    expect((await pending).terminal).toBe('cancelled');
  });

  test.each([['approve', 'approved'], ['decline', 'declined']])('plan %s maps to %s', async (reply, expected) => {
    const bridge = new WebSetupBridge('owner/repo');
    const confirmation = new WebSetupPlanConfirmation(bridge);
    const pending = confirmation.confirm(emptyPlan());
    expect(bridge.snapshot().prompt?.kind).toBe('plan');
    const planPrompt = bridge.snapshot().prompt;
    if (planPrompt?.kind === 'plan') expect(planPrompt.plan.secrets).toEqual(['PAT']);
    answer(bridge, reply);
    expect((await pending).kind).toBe(expected);
  });

  test('the web plan displays exact trusted check producers and rejects unknown edit groups', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const base = emptyPlan();
    const plan = { ...base, configuration: { ...base.configuration,
      pullRequestApproval: { ...base.configuration.pullRequestApproval,
        testChecks: [{ name: 'tests', sourceAppId: 42, workflowName: 'CI' }] } } };
    const pending = new WebSetupPlanConfirmation(bridge).confirm(plan);
    const prompt = bridge.snapshot().prompt;
    expect(prompt?.kind).toBe('plan');
    if (prompt?.kind === 'plan') expect(prompt.plan.decisions.trustedChecks).toEqual([
      { name: 'tests', sourceAppId: 42, workflowName: 'CI' },
    ]);
    const revision = bridge.snapshot().promptRevision!;
    expect(bridge.answer(revision, 'revise:unlisted')).toBe(false);
    expect(bridge.snapshot().promptRevision).toBe(revision);
    answer(bridge, 'approve');
    expect((await pending).kind).toBe('approved');
  });

  test('web plan revision only accepts a section actually offered in the current plan', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const pending = new WebSetupPlanConfirmation(bridge).confirm(emptyPlan());
    const prompt = bridge.snapshot().prompt;
    expect(prompt?.kind).toBe('plan');
    const group = prompt?.kind === 'plan' ? prompt.editGroups?.[0] : undefined;
    expect(group).toBeDefined();
    answer(bridge, `revise:${group}`);
    expect(await pending).toEqual({ kind: 'revise', group });

    const invalidBridge = new WebSetupBridge('owner/repo');
    jest.spyOn(invalidBridge, 'ask').mockResolvedValueOnce('revise:unlisted');
    await expect(new WebSetupPlanConfirmation(invalidBridge).confirm(emptyPlan())).rejects.toThrow('Invalid setup section.');
  });

  test('guided bot token uses distinct GitHub link, numeric identity, and masked handoff', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const resolve = jest.fn().mockResolvedValue({ login: 'bot-user', id: 42 });
    prompt.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new?name=bot', resolve);
    const pending = prompt.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'runtime' });
    answer(bridge, 'Guided GitHub link');
    await next();
    expect(bridge.snapshot().prompt?.kind).toBe('text');
    answer(bridge, 'bot-user');
    await next();
    const secretPrompt = bridge.snapshot().prompt;
    expect(secretPrompt?.kind).toBe('secret');
    if (secretPrompt?.kind === 'secret') {
      expect(secretPrompt.link).toContain('github.com/settings/personal-access-tokens/new');
      expect(secretPrompt.description).toContain('GitHub ID 42');
    }
    answer(bridge, 'github_pat_fake_bot_value');
    expect((await pending)?.value).toBe('github_pat_fake_bot_value');
    expect(prompt.guidedWorkflowBotIdentity?.id).toBe(42);
    expect(resolve).toHaveBeenCalledWith('bot-user');
    expect(JSON.stringify(bridge.snapshot())).not.toContain('github_pat_fake_bot_value');
  });

  test('setup PAT guidance and verified account confirmation remain role-specific', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const method = prompt.chooseSetupPatMethod();
    answer(bridge, 'Guided GitHub link');
    expect(await method).toBe('guided');
    prompt.configureSetupPatGuide('https://github.com/settings/personal-access-tokens/new?name=setup');
    const token = prompt.requestSetupPat();
    expect(bridge.snapshot().prompt?.kind).toBe('secret');
    answer(bridge, 'github_pat_fake_setup_value');
    expect(await token).toBe('github_pat_fake_setup_value');
    const account = prompt.confirmGuidedSetupAccount('operator');
    expect(bridge.snapshot().prompt?.title).toContain('@operator');
    answer(bridge, 'No, stop');
    expect(await account).toBe(false);
    expect(JSON.stringify(bridge.snapshot())).not.toContain('github_pat_fake_setup_value');
  });

  test('unverifiable required writes need a specific acknowledgement', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const report: SetupTokenPermissionReport = {
      role: 'setup', identityStatus: 'valid', identityMessage: 'checked', ready: false, confirmationRequired: true,
      checks: [{ id: 'secrets', role: 'setup', scope: 'repository', permission: 'Secrets', level: 'write',
        applicability: 'required', reason: 'Provision', probe: 'secrets', status: 'unverifiable', message: 'No safe write probe' }],
    };
    const pending = prompt.confirmUnverifiableTokenPermissions(report);
    answer(bridge, 'Yes, I checked them');
    expect(await pending).toBe(true);
    const presenter = new WebSetupPermissionPresenter(bridge);
    presenter.showReport(report);
    expect(bridge.snapshot().permissions?.report?.checks[0].status).toBe('unverifiable');
  });

  test('workflow update decision is explicit and never inferred from a changed file', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupWorkflowUpdatePrompt(bridge);
    const pending = prompt.confirmWorkflowUpdates([{ file: 'copilot.yml', destination: '.github/workflows/copilot.yml', status: 'changed' }], false);
    expect(bridge.snapshot().prompt?.title).toContain('Update existing workflows');
    answer(bridge, 'Keep existing');
    expect(await pending).toBe(false);
  });

  test.each([['Organization', 'Organization'], ['Personal account', 'User'], ['Not sure', 'unknown']])('owner answer %s resolves to %s', async (reply, expected) => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const pending = prompt.chooseSetupOwnerKind();
    answer(bridge, reply);
    expect(await pending).toBe(expected);
  });

  test.each([
    ['Continue to GitHub', 'continue'], ['Review setup choices again', 'revise'],
    ['View full permission table', 'details'], ['Enter a PAT manually', 'manual'],
  ])('intent review %s resolves to %s', async (reply, expected) => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const pending = prompt.reviewSetupPatIntent();
    answer(bridge, reply);
    expect(await pending).toBe(expected);
  });

  test('manual setup PAT does not claim guided account verification or cleanup', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const pending = prompt.chooseSetupPatMethod();
    answer(bridge, 'Manual PAT');
    expect(await pending).toBe('manual');
    expect(prompt.usedGuidedSetupPat).toBe(false);
    expect(await prompt.confirmGuidedSetupAccount()).toBe(true);
    prompt.showSetupPatCleanupReminder();
    expect(bridge.snapshot().message).toBeUndefined();
  });

  test('guided cleanup and corrected link are visible without token values', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const pending = prompt.chooseSetupPatMethod();
    answer(bridge, 'Guided GitHub link');
    await pending;
    prompt.configureSetupPatGuide('https://github.com/settings/personal-access-tokens/new?name=setup');
    prompt.showUpdatedSetupPatLink('https://github.com/settings/personal-access-tokens/new?name=updated', 'final', ['Secrets write']);
    expect(bridge.snapshot().message?.link).toContain('name=updated');
    expect(bridge.snapshot().message?.text).toContain('Secrets write');
    prompt.showSetupPatCleanupReminder();
    expect(bridge.snapshot().message?.link).toBe('https://github.com/settings/personal-access-tokens');
    prompt.useManualSetupPat();
    expect(prompt.usedGuidedSetupPat).toBe(false);
  });

  test.each([['Keep existing', false], ['Update setup-managed workflows', true]])('workflow answer %s maps to %s', async (reply, expected) => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupWorkflowUpdatePrompt(bridge);
    const comparisons = [{ file: 'copilot.yml', destination: '.github/workflows/copilot.yml', status: 'unmanaged' as const }];
    const pending = prompt.confirmWorkflowUpdates(comparisons, false);
    answer(bridge, reply);
    expect(await pending).toBe(expected);
  });

  test('workflow update leaves unchanged files alone and honors an explicit flag', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupWorkflowUpdatePrompt(bridge);
    const comparison = { file: 'copilot.yml', destination: '.github/workflows/copilot.yml', status: 'changed' as const };
    expect(await prompt.confirmWorkflowUpdates([{ ...comparison, status: 'unchanged' }], false)).toBe(false);
    expect(await prompt.confirmWorkflowUpdates([comparison], true)).toBe(true);
    expect(bridge.snapshot().prompt).toBeUndefined();
  });

  test('manual bot PAT falls back to permission table without claiming ID binding', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    prompt.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new?name=bot', async () => ({ login: 'bot', id: 1 }), []);
    const pending = prompt.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'runtime' });
    answer(bridge, 'Manual PAT');
    await next();
    expect(bridge.snapshot().prompt?.kind).toBe('secret');
    expect(bridge.snapshot().permissions?.role).toBe('workflow');
    answer(bridge, 'manual_fake_pat');
    expect((await pending)?.value).toBe('manual_fake_pat');
    expect(prompt.guidedWorkflowBotIdentity).toBeUndefined();
  });

  test('manual bot entry without prepared requirements does not invent a permission table', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    prompt.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new', async () => ({ login: 'bot', id: 1 }));
    const pending = prompt.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'runtime' });
    answer(bridge, 'Manual PAT');
    await next();
    expect(bridge.snapshot().permissions).toBeUndefined();
    answer(bridge, 'manual_fake_pat');
    expect((await pending)?.value).toBe('manual_fake_pat');
  });

  test('API key and existing credential decisions stay in separate secret/choice prompts', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const requirement = { name: 'OPENAI_API_KEY', kind: 'apiKey' as const, description: 'AI', provider: 'OpenAI', alternativeGroups: ['agent'] };
    const check: SetupCredentialCheck = { name: requirement.name, status: 'unverifiable', message: 'Value cannot be read.' };
    const decision = prompt.chooseExistingCredential(requirement, check);
    expect(bridge.snapshot().prompt?.kind).toBe('choice');
    answer(bridge, 'replace');
    expect(await decision).toBe('replace');
    const value = prompt.requestApiKey(requirement, check);
    expect(bridge.snapshot().prompt?.kind).toBe('secret');
    if (bridge.snapshot().prompt?.kind === 'secret') expect(bridge.snapshot().prompt).toMatchObject({ optional: true });
    answer(bridge, 'fake_api_key');
    expect((await value)?.value).toBe('fake_api_key');
    expect(JSON.stringify(bridge.snapshot())).not.toContain('fake_api_key');
  });

  test('presentation adapters publish redacted plan, journey and permission facts', () => {
    const bridge = new WebSetupBridge('owner/repo');
    new WebSetupPlanPresenter(bridge).present(emptyPlan());
    expect(bridge.snapshot().message?.text).toContain('1 Secret names');
    new WebSetupPermissionPresenter(bridge).showRequirements('setup', []);
    expect(bridge.snapshot().permissions?.role).toBe('setup');
    new WebSetupPermissionPresenter(bridge).showDetailedRequirements('workflow', []);
    expect(bridge.snapshot().permissions?.role).toBe('workflow');
    new WebSetupJourneyPresenter(bridge).present({ repository: 'owner/repo', position: 2, total: 6,
      current: 'Setup choices', complete: ['Repository'], pending: ['Setup PAT'], mutationStarted: false, choiceReviewPass: 2 });
    expect(bridge.snapshot().journey?.choiceReviewPass).toBe(2);
  });

  test('a cancelled plan and cancelled workflow decision do not approve anything', async () => {
    const planBridge = new WebSetupBridge('owner/repo');
    const plan = new WebSetupPlanConfirmation(planBridge).confirm(emptyPlan());
    planBridge.cancel();
    expect((await plan).kind).toBe('cancelled');
    const workflowBridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupWorkflowUpdatePrompt(workflowBridge);
    const workflow = prompt.confirmWorkflowUpdates([{ file: 'a', destination: 'a', status: 'changed' }], false);
    workflowBridge.cancel();
    await expect(workflow).rejects.toThrow('cancelled');
  });

  test('invalid browser choice cannot consume a prompt and cancellation never supplies a PAT', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const method = prompt.chooseSetupPatMethod();
    const revision = bridge.snapshot().promptRevision!;
    expect(bridge.answer(revision, 'not-an-option')).toBe(false);
    expect(bridge.snapshot().promptRevision).toBe(revision);
    answer(bridge, 'Manual PAT');
    expect(await method).toBe('manual');
    const token = prompt.requestSetupPat();
    bridge.cancel();
    await expect(token).rejects.toThrow('cancelled');
  });

  test('rejects an out-of-contract choice even if the bridge supplies one', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    jest.spyOn(bridge, 'ask').mockResolvedValueOnce('unlisted choice');
    await expect(new WebSetupCredentialPrompt(bridge).chooseSetupPatMethod()).rejects.toThrow('Invalid setup choice');
  });

  test('guided setup account requires a reported identity and a positive operator decision', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const method = prompt.chooseSetupPatMethod();
    answer(bridge, 'Guided GitHub link');
    await method;
    expect(await prompt.confirmGuidedSetupAccount()).toBe(false);
    const confirmed = prompt.confirmGuidedSetupAccount('operator');
    answer(bridge, 'Yes, continue');
    expect(await confirmed).toBe(true);
  });

  test('unverifiable writes without a required confirmation do not prompt', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const report: SetupTokenPermissionReport = { role: 'setup', identityStatus: 'valid', identityMessage: 'checked',
      ready: true, confirmationRequired: false, checks: [] };
    expect(await prompt.confirmUnverifiableTokenPermissions(report)).toBe(false);
    expect(bridge.snapshot().prompt).toBeUndefined();
    const noWrite: SetupTokenPermissionReport = { ...report, ready: false, confirmationRequired: true };
    expect(await prompt.confirmUnverifiableTokenPermissions(noWrite)).toBe(false);
  });

  test('invalid guided bot login blocks before a PAT is requested', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const resolve = jest.fn();
    prompt.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new', resolve);
    const pending = prompt.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'runtime' });
    answer(bridge, 'Guided GitHub link');
    await next();
    answer(bridge, 'invalid/login');
    await expect(pending).rejects.toThrow('valid GitHub bot login');
    expect(resolve).not.toHaveBeenCalled();
    expect(bridge.snapshot().prompt).toBeUndefined();
  });

  test('credential explanation and checks distinguish invalid from verified evidence', () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    prompt.explainCredentialSeparation([{ name: 'PAT', kind: 'workflowPat', description: 'runtime' }]);
    expect(bridge.snapshot().message?.text).toContain('separate from your setup PAT');
    prompt.showCredentialChecks([{ name: 'PAT', status: 'invalid', message: 'Wrong account' }]);
    expect(bridge.snapshot().message?.tone).toBe('warning');
    prompt.showCredentialChecks([{ name: 'PAT', status: 'valid', message: 'Checked' }]);
    expect(bridge.snapshot().message?.tone).toBe('success');
  });

  test('cancelled bot-login and optional API-key inputs never produce credentials', async () => {
    const botBridge = new WebSetupBridge('owner/repo');
    const botPrompt = new WebSetupCredentialPrompt(botBridge);
    botPrompt.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new', async () => ({ login: 'bot', id: 1 }));
    const bot = botPrompt.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'runtime' });
    answer(botBridge, 'Guided GitHub link');
    await next();
    botBridge.cancel();
    await expect(bot).rejects.toThrow('cancelled');

    const keyBridge = new WebSetupBridge('owner/repo');
    const keyPrompt = new WebSetupCredentialPrompt(keyBridge);
    const key = keyPrompt.requestApiKey({ name: 'OPENAI_API_KEY', kind: 'apiKey', description: 'AI', alternativeGroups: ['agent'] });
    answer(keyBridge, '');
    expect(await key).toBeUndefined();
  });

  test('manual bot entry without a prepared link shows existing status but no numeric identity claim', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const pending = prompt.requestWorkflowPat({ name: 'PAT', kind: 'workflowPat', description: 'runtime' },
      { name: 'PAT', status: 'unverifiable', message: 'Existing value unreadable' });
    expect(bridge.snapshot().prompt?.kind).toBe('secret');
    const secret = bridge.snapshot().prompt;
    if (secret?.kind === 'secret') {
      expect(secret.description).toContain('Existing Secret: unverifiable');
      expect(secret.link).toBeUndefined();
    }
    answer(bridge, '');
    expect(await pending).toBeUndefined();
    expect(prompt.guidedWorkflowBotIdentity).toBeUndefined();
  });

  test('a cancelled choice and a corrected bootstrap link do not grant access', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const prompt = new WebSetupCredentialPrompt(bridge);
    const method = prompt.chooseSetupPatMethod();
    bridge.cancel();
    await expect(method).rejects.toThrow('cancelled');
    const another = new WebSetupBridge('owner/repo');
    new WebSetupCredentialPrompt(another).showUpdatedSetupPatLink('https://github.com/settings/personal-access-tokens/new', 'bootstrap');
    expect(another.snapshot().message?.text).toContain('access failed');
  });
});
