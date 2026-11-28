import { executeSetupPublisherCommand, type SetupPublisherCommandInput } from '../setup_publisher_installation_adapter';
import { createSetupPublisherInstallationCompositionRoot } from '../../infrastructure/composition/setup_publisher_installation_composition_root';
import { readSetupPublisherProposalFile, SetupPublisherProposalFileError } from '../setup_publisher_proposal_file';
import { createInteractiveTerminalDriver } from '../setup_terminal_driver';
import { setupPublisherFixture } from '../../application/policies/__tests__/fixtures/setup_publisher_fixture';
import { planSetupPublisherInstallation, SetupPublisherPlanError } from '../../application/policies/setup_publisher_plan_policy';
import { SetupPublisherApplyError } from '../../application/usecases/setup/apply_setup_publisher_use_case';
import { SetupPublisherReviewError } from '../../application/usecases/setup/review_setup_publisher_use_case';
import { SetupPublisherInstallationError } from '../../application/usecases/setup/install_setup_publisher_use_case';
import { SetupPublisherCredentialError } from '../../infrastructure/setup_publisher_credentials';
import { SetupBatchProviderError } from '../../infrastructure/setup_batch_github_read_adapter';
import { resolveStaticSetupPublisherCatalog } from '../../application/policies/setup_publisher_message_catalog';
import type { SetupPublisherOperation, SetupPublisherPlan } from '../../domain/setup_publisher_installation';
import type { TerminalDriver, TerminalReadResult } from '../../application/ports/setup_terminal_ports';
import type { SetupPublisherInventoryFailure } from '../../domain/setup_publisher_inventory_review';

jest.mock('../../infrastructure/composition/setup_publisher_installation_composition_root', () => ({ createSetupPublisherInstallationCompositionRoot: jest.fn() }));
jest.mock('../setup_publisher_proposal_file', () => {
  const actual = jest.requireActual<typeof import('../setup_publisher_proposal_file')>('../setup_publisher_proposal_file');
  return { ...actual, readSetupPublisherProposalFile: jest.fn() };
});
jest.mock('../setup_terminal_driver', () => ({ createInteractiveTerminalDriver: jest.fn() }));
let output: jest.SpyInstance, originalEnv: NodeJS.ProcessEnv, originalExit: typeof process.exitCode;
beforeEach(() => {
  jest.clearAllMocks(); originalEnv = { ...process.env }; originalExit = process.exitCode;
  process.env.PERSONAL_ACCESS_TOKEN = 'private-environment-fixture-token'; delete process.env.LC_ALL; delete process.env.LC_MESSAGES; process.env.LANG = 'en_US.UTF-8';
  process.exitCode = undefined; output = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => { output.mockRestore(); process.env = originalEnv; process.exitCode = originalExit; });

function fixture() {
  const data = setupPublisherFixture(), id = '11111111-1111-4111-8111-111111111111';
  const plan = planSetupPublisherInstallation(data.proposal, data.inspection, id);
  const operation: SetupPublisherOperation = { schemaVersion: 2, purpose: plan.purpose, operationId: id, repositoryId: plan.target.id,
    repository: 'owner/project', defaultBranch: 'main', baseSha: plan.target.baseSha, sourceCommit: plan.sourceCommit,
    planDigest: plan.digest, approvalDigest: plan.approvalDigest!, actorId: plan.actorId, status: 'waiting-for-merge',
    effects: ['tree', 'commit', 'branch', 'pull-request'], preparedTree: 'a'.repeat(40), preparedCommit: 'b'.repeat(40), pullRequestNumber: 73 };
  const readText = jest.fn(async (): Promise<TerminalReadResult> => ({ kind: 'value', value: 'DECLINE' }));
  const readSecret = jest.fn(async (): Promise<TerminalReadResult> => ({ kind: 'value', value: 'private-hidden-fixture-token' }));
  const close = jest.fn(), terminal: TerminalDriver = { isInteractive: () => true, readText, readSecret, close };
  jest.mocked(createInteractiveTerminalDriver).mockReturnValue(undefined);
  jest.mocked(readSetupPublisherProposalFile).mockReturnValue(data.proposal);
  const execute = jest.fn<ReturnType<ReturnType<typeof createSetupPublisherInstallationCompositionRoot>['execute']>, Parameters<ReturnType<typeof createSetupPublisherInstallationCompositionRoot>['execute']>>();
  let confirmed: 'approve' | 'decline' | 'cancel' | undefined;
  jest.mocked(createSetupPublisherInstallationCompositionRoot).mockImplementation((_token, presentation) => {
    execute.mockImplementation(async input => {
      await presentation.present(plan, operation);
      if (input.dryRun) return { plan, stage: 'dry-run' };
      confirmed = await presentation.confirm(plan);
      return confirmed === 'approve' ? { plan, stage: 'apply', result: operation }
        : { plan, stage: confirmed === 'decline' ? 'declined' : 'cancelled' };
    });
    return { execute } as unknown as ReturnType<typeof createSetupPublisherInstallationCompositionRoot>;
  });
  const input: SetupPublisherCommandInput = { proposalPath: 'proposal.json', explicitOptions: ['publisherManifest'], token: undefined, dryRun: true, resumeOperation: undefined };
  const run = (change: Partial<SetupPublisherCommandInput> = {}) => executeSetupPublisherCommand({ ...input, ...change });
  const text = () => output.mock.calls.map(call => String(call[0])).join('');
  return { ...data, plan, operation, input, run, execute, terminal, readText, readSecret, close, text, confirmed: () => confirmed };
}
function observeCommandCredentials() {
  const environment = process.env, environmentReads: string[] = [];
  const policy = jest.requireActual<typeof import('../../application/policies/setup_token_value_policy')>('../../application/policies/setup_token_value_policy');
  const validation = jest.spyOn(policy, 'isSetupTokenValueValid');
  process.env = new Proxy({ ...environment }, { get(target, key, receiver) {
    if (key === 'PERSONAL_ACCESS_TOKEN') environmentReads.push(key);
    return Reflect.get(target, key, receiver);
  } });
  return { environmentReads, validation, restore() { process.env = environment; validation.mockRestore(); } };
}
it.each(['en-US', 'es-ES', 'fr-FR', 'pt-BR', 'de-DE'])(
  'publisher-inventory-recovery-C04: actual %s CLI rejects initial/resumed inventory without displaying approval authority', async locale => {
    process.env.LANG = locale.replace('-', '_') + '.UTF-8';
    const catalog = resolveStaticSetupPublisherCatalog(locale);
    const causes: [SetupPublisherInventoryFailure, Parameters<typeof catalog.message>[0]][] = [
      ['invalid-document', 'inventoryInvalid'], ['binding-mismatch', 'inventoryStale'], ['review-unavailable', 'inventoryUnavailable'],
      ['review-required', 'inventoryRequired'], ['changes-requested', 'inventoryChangesRequested'],
      ['incompatible-producer', 'inventoryIncompatible'], ['unresolved-closure', 'inventoryUnresolved'],
    ];
    for (const [reason, message] of causes) for (const resume of [false, true]) {
      jest.clearAllMocks(); output.mockClear(); process.exitCode = undefined;
      const f = fixture(), evidence = { pullRequest: 81, head: '6'.repeat(40), documentSha256: '7'.repeat(64) };
      Object.assign(f.proposal, { schemaVersion: 2, inventoryReview: evidence });
      jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal);
      const execute = jest.fn(async (input: { operationId: string }) => { throw new SetupPublisherReviewError('inventory',
        { reason, operationId: input.operationId, repository: 'owner/project', evidence }, resume ? f.operation : undefined); });
      jest.mocked(createSetupPublisherInstallationCompositionRoot).mockReturnValue({ execute,
        operationLocation: async () => `file:///owned/${f.operation.operationId}.json` });
      await f.run({ dryRun: false, ...(resume ? { explicitOptions: ['publisherManifest', 'resumeOperation'], resumeOperation: f.operation.operationId } : {}) });
      const text = f.text(), normalized = text.replace(/\s+/gu, ' ');
      expect(normalized).toContain(catalog.message('inventoryBlocked'));
      expect(normalized).toContain(catalog.message(message));
      expect(normalized).toContain(catalog.message('inventoryNoAuthority'));
      expect(text).toContain('https://github.com/owner/project/pull/81');
      if (resume) expect(text).toContain('https://github.com/owner/project/pull/73');
      else expect(text).not.toContain('https://github.com/owner/project/pull/73');
      expect(text).not.toContain('Complete file:'); expect(text).not.toContain(catalog.message('confirm', { approve: catalog.message('approve'), decline: catalog.message('decline') }));
      expect(text).not.toMatch(/private-environment-fixture-token|private-hidden-fixture-token|approvalDigest/u);
      expect(f.readText).not.toHaveBeenCalled(); expect(execute).toHaveBeenCalledTimes(1); expect(process.exitCode).toBe(1);
    }
  },
);
it('publisher-inventory-C46: cancellation preserves the stopped state and known saved PR without another prompt', async () => {
  const f = fixture(); jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal);
  jest.mocked(createSetupPublisherInstallationCompositionRoot).mockReturnValue({
    execute: async () => { throw new SetupPublisherReviewError('cancelled', undefined, f.operation); },
    operationLocation: async () => `file:///owned/${f.operation.operationId}.json`,
  });
  await f.run({ dryRun: false, explicitOptions: ['publisherManifest', 'resumeOperation'], resumeOperation: f.operation.operationId });
  expect(f.text()).toContain('https://github.com/owner/project/pull/73');
  expect(f.text()).toContain(resolveStaticSetupPublisherCatalog().message('cancelled'));
  expect(f.text()).not.toContain('Complete file:'); expect(f.readText).not.toHaveBeenCalled(); expect(process.exitCode).toBe(130);
});
it.each(['en-US', 'es-ES', 'fr-FR', 'pt-BR', 'de-DE'])(
  'publisher-inventory-C47: %s planning rejection preserves its precise cause and retained PR without a confirmation', async locale => {
    process.env.LANG = locale.replace('-', '_') + '.UTF-8';
    const catalog = resolveStaticSetupPublisherCatalog(locale);
    for (const [reason, message] of [['destination-changed', 'stale'], ['authority-unverified', 'authority'],
      ['source-unverified', 'sourceUnverified'], ['installation-unsupported', 'unsupported']] as const) {
      jest.clearAllMocks(); output.mockClear(); process.exitCode = undefined;
      const f = fixture(); jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal);
      jest.mocked(createSetupPublisherInstallationCompositionRoot).mockReturnValue({
        execute: async () => { throw new SetupPublisherReviewError('planning', undefined, f.operation, reason); },
        operationLocation: async () => `file:///owned/${f.operation.operationId}.json`,
      });
      await f.run({ dryRun: false, explicitOptions: ['publisherManifest', 'resumeOperation'], resumeOperation: f.operation.operationId });
      expect(f.text()).toContain(catalog.message(message)); expect(f.text()).toContain('https://github.com/owner/project/pull/73');
      expect(f.text()).toContain(`file:///owned/${f.operation.operationId}.json`);
      expect(f.text()).not.toContain(catalog.message('confirm', { approve: catalog.message('approve'), decline: catalog.message('decline') }));
      expect(f.text()).not.toContain('Complete file:'); expect(f.readText).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1);
    }
  });
it('publisher977-C109: actual CLI forwards the read-only known operation target to its presenter', async () => {
  const f = fixture(), url = `file:///owned/setup-operations/${f.operation.operationId}.json`;
  const factory = jest.mocked(createSetupPublisherInstallationCompositionRoot).getMockImplementation()!;
  const operationLocation = jest.fn(async () => url);
  jest.mocked(createSetupPublisherInstallationCompositionRoot).mockImplementation((...args) =>
    Object.assign(factory(...args), { operationLocation }));
  await f.run();
  expect(operationLocation).toHaveBeenCalledWith(f.operation.operationId);
  expect(f.text()).toContain(url);
  expect(f.text()).not.toContain('/actions/runs/');
});
it.each(['apply', 'journal-error', 'lookup-failure'] as const)(
  'publisher977-C109: %s preserves operation status while resolving navigation independently', async stage => {
    const f = fixture(), url = `file:///owned/${f.operation.operationId}.json`;
    jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal);
    const operationLocation = jest.fn(async () => {
      if (stage === 'lookup-failure') throw new Error('private-navigation-error');
      return url;
    });
    jest.mocked(createSetupPublisherInstallationCompositionRoot).mockReturnValue({ operationLocation,
      execute: async () => {
        if (stage !== 'apply') throw new SetupPublisherApplyError('journal', f.operation, undefined);
        return { plan: f.plan, stage: 'apply', result: f.operation };
      } });
    await f.run({ dryRun: false });
    expect(operationLocation).toHaveBeenCalledWith(f.operation.operationId);
    expect(f.text()).toContain(f.operation.preparedCommit!);
    expect(f.text()).toContain('https://github.com/owner/project/pull/73');
    expect(f.text()).not.toContain('private-navigation-error');
    expect(f.text()).not.toContain('/actions/runs/');
    if (stage === 'lookup-failure') expect(f.text()).not.toContain(url);
    else expect(f.text()).toContain(url);
    expect(process.exitCode ?? 0).toBe(stage === 'apply' ? 0 : 1);
    if (stage !== 'apply') expect(f.text()).toContain('could not be saved');
  });
it('a noninteractive dry-run shows the complete preview and no token or approval prompt', async () => {
  const f = fixture(); await f.run(); expect(f.text()).toContain('Complete file:'); expect(f.text()).toContain('Preview complete.');
  expect(f.readText).not.toHaveBeenCalled(); expect(f.readSecret).not.toHaveBeenCalled();
  expect(f.text()).not.toContain('private-environment-fixture-token'); expect(process.exitCode).toBeUndefined();
  expect(f.execute).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, resume: false, proposal: f.proposal }));
});
it.each(['web', 'batch', 'yes', 'nonInteractive', 'config', 'skipSecrets'])('rejects explicit generic %s provenance before file, terminal or transport work', async flag => {
  const f = fixture(); await f.run({ explicitOptions: ['publisherManifest', flag] });
  expect(readSetupPublisherProposalFile).not.toHaveBeenCalled(); expect(createInteractiveTerminalDriver).not.toHaveBeenCalled(); expect(createSetupPublisherInstallationCompositionRoot).not.toHaveBeenCalled(); expect(f.text()).toContain('options or local proposal are invalid');
});
it.each([{ proposalPath: '' }, { proposalPath: 7 }, { dryRun: 'false' }, { explicitOptions: [] }])('invalid local invocation creates no transport', async change => {
  const f = fixture(); await f.run(change as Partial<SetupPublisherCommandInput>); expect(createSetupPublisherInstallationCompositionRoot).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1);
});
it('unsafe proposal input fails before opening a terminal or resolving a credential', async () => {
  const f = fixture(); jest.mocked(readSetupPublisherProposalFile).mockImplementation(() => { throw new SetupPublisherProposalFileError('not-regular'); });
  await f.run(); expect(createInteractiveTerminalDriver).not.toHaveBeenCalled(); expect(createSetupPublisherInstallationCompositionRoot).not.toHaveBeenCalled();
});
it.each(['', 'too-short', undefined])('an invalid explicit token never falls back to the valid environment credential', async token => {
  const f = fixture(); await f.run({ explicitOptions: ['publisherManifest', 'token'], token });
  expect(createSetupPublisherInstallationCompositionRoot).not.toHaveBeenCalled(); expect(f.text()).not.toContain('private-environment-fixture-token'); expect(f.text()).toContain('Provide a valid --token');
});
it('requires a terminal for Apply and cannot use implicit yes or pipe input as approval', async () => {
  const f = fixture(); await f.run({ dryRun: false }); expect(f.execute).not.toHaveBeenCalled(); expect(f.text()).toContain('interactive terminal');
});
it('a missing token in a noninteractive dry-run never creates a provider', async () => {
  const f = fixture(); delete process.env.PERSONAL_ACCESS_TOKEN; await f.run(); expect(createSetupPublisherInstallationCompositionRoot).not.toHaveBeenCalled();
});
it('uses hidden credential entry and closes the owned terminal after the preview', async () => {
  const f = fixture(); delete process.env.PERSONAL_ACCESS_TOKEN; jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal);
  await f.run(); expect(f.readSecret).toHaveBeenCalledWith('GitHub token (hidden)'); expect(f.readText).not.toHaveBeenCalled(); expect(f.close).toHaveBeenCalled();
  expect(f.text()).not.toContain('private-hidden-fixture-token');
});
it.each(['cancel', 'end-of-input'] as const)('a %s while entering a hidden token starts no provider', async kind => {
  const f = fixture(); delete process.env.PERSONAL_ACCESS_TOKEN; jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal); f.readSecret.mockResolvedValue({ kind });
  await f.run(); expect(createSetupPublisherInstallationCompositionRoot).not.toHaveBeenCalled(); expect(f.text()).toContain('Installation stopped');
  expect(process.exitCode).toBe(130); expect(f.close).toHaveBeenCalled();
});
it('rejects an invalid hidden credential instead of inventing authority', async () => {
  const f = fixture(); delete process.env.PERSONAL_ACCESS_TOKEN; jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal); f.readSecret.mockResolvedValue({ kind: 'value', value: '' });
  await f.run(); expect(createSetupPublisherInstallationCompositionRoot).not.toHaveBeenCalled();
});
it.each(['en-US', 'es-ES', 'fr-FR', 'pt-BR'])('approves exact files only with the full localized word in %s', async locale => {
  const f = fixture(), catalog = resolveStaticSetupPublisherCatalog(locale); process.env.LANG = locale; jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal);
  f.readText.mockResolvedValue({ kind: 'value', value: catalog.message('approve') }); await f.run({ dryRun: false });
  expect(f.confirmed()).toBe('approve'); expect(f.text()).toContain('https://github.com/owner/project/pull/73'); expect(f.text()).toContain(catalog.message('nativePending'));
  expect(createSetupPublisherInstallationCompositionRoot).toHaveBeenCalledWith(expect.any(String), expect.any(Object), catalog.locale);
});
it.each(['DECLINE', '', 'yes', 'approve'])('handles %s without an implicit approval', async value => {
  const f = fixture(); jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal); f.readText.mockResolvedValue({ kind: 'value', value });
  await f.run({ dryRun: false }); expect(f.confirmed()).toBe(value === 'DECLINE' ? 'decline' : 'cancel');
  expect(process.exitCode ?? 0).toBe(value === 'DECLINE' ? 0 : 130);
});
it.each(['cancel', 'end-of-input'] as const)('a %s during approval exits130 without a completed delivery', async kind => {
  const f = fixture(); jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal); f.readText.mockResolvedValue({ kind });
  await f.run({ dryRun: false }); expect(f.confirmed()).toBe('cancel'); expect(f.text()).not.toContain('ready for review:');
  expect(process.exitCode).toBe(130); expect(f.close).toHaveBeenCalled();
});
it('preserves cancellation status from Apply and displays its retained effects', async () => {
  const f = fixture(); jest.mocked(createSetupPublisherInstallationCompositionRoot).mockImplementation(() => {
    throw new SetupPublisherApplyError('cancelled', f.operation, f.operation);
  });
  await f.run(); expect(process.exitCode).toBe(130); expect(f.text()).toContain('Installation stopped');
  expect(f.text()).toContain(f.operation.preparedCommit!); expect(f.text()).not.toContain('ready for review:');
});
it.each(['stale', 'delivery'] as const)('keeps an active-session %s Apply failure separate from cancellation', async reason => {
  const f = fixture(); jest.mocked(createSetupPublisherInstallationCompositionRoot).mockImplementation(() => {
    throw new SetupPublisherApplyError(reason, f.operation, f.operation);
  });
  await f.run(); expect(process.exitCode).toBe(1);
  expect(f.text()).toContain(resolveStaticSetupPublisherCatalog().message(reason === 'stale' ? 'stale' : 'blocked'));
  expect(f.text()).not.toContain('Installation stopped');
});
it.each(['', 'invalid-operation', '../other-operation', '11111111-1111-1111-8111-111111111111'])(
  'publisher977-C102: malformed resume %s reports invalid input before terminal or provider work', async resumeOperation => {
    const f = fixture(), credential = observeCommandCredentials();
    try {
      for (const explicitToken of [false, true]) {
        output.mockClear();
        await f.run({ explicitOptions: ['publisherManifest', 'resumeOperation', ...(explicitToken ? ['token'] : [])],
          token: explicitToken ? 'private-explicit-fixture-token' : undefined, resumeOperation });
        expect(process.exitCode).toBe(1);
        expect(f.text()).toBe(resolveStaticSetupPublisherCatalog().message('invalid') + '\n');
        expect(createInteractiveTerminalDriver).not.toHaveBeenCalled();
        expect(createSetupPublisherInstallationCompositionRoot).not.toHaveBeenCalled();
        expect(f.execute).not.toHaveBeenCalled();
        expect(credential.environmentReads).toEqual([]);
        expect(credential.validation).not.toHaveBeenCalled();
      }
    } finally { credential.restore(); }
  });
it('validates explicit resume identity before transport and passes a valid selection through', async () => {
  const f = fixture(), credential = observeCommandCredentials();
  try {
    await f.run({ explicitOptions: ['publisherManifest', 'resumeOperation'], resumeOperation: 7 }); expect(f.execute).not.toHaveBeenCalled();
    expect(credential.environmentReads).toEqual([]); expect(credential.validation).not.toHaveBeenCalled();
    await f.run({ explicitOptions: ['publisherManifest', 'resumeOperation'], resumeOperation: f.operation.operationId });
    expect(f.execute).toHaveBeenCalledWith(expect.objectContaining({ operationId: f.operation.operationId, resume: true }));
    expect(credential.environmentReads).toEqual(['PERSONAL_ACCESS_TOKEN']); expect(credential.validation).toHaveBeenCalledTimes(1);
  } finally { credential.restore(); }
});
it.each([
  [() => new SetupPublisherCredentialError(), 'tokenRequired'],
  [() => new SetupPublisherPlanError('destination-changed'), 'stale'], [() => new SetupPublisherPlanError('authority-unverified'), 'authority'],
  [() => new SetupPublisherPlanError('source-unverified'), 'sourceUnverified'], [() => new SetupPublisherPlanError('installation-unsupported'), 'unsupported'],
  [() => new SetupPublisherReviewError('cancelled'), 'cancelled'], [() => new SetupPublisherReviewError('stale'), 'stale'], [() => new SetupPublisherReviewError('unavailable'), 'blocked'],
  [() => new SetupPublisherInstallationError('resume-missing'), 'resumeMissing'], [() => new SetupPublisherInstallationError('resume-required'), 'resumeRequired'],
  [() => new SetupPublisherInstallationError('invalid'), 'invalid'], [() => new SetupPublisherInstallationError('journal'), 'blocked'],
  [() => new SetupBatchProviderError('forbidden'), 'authority'], [() => new SetupBatchProviderError('unknown'), 'blocked'],
  [() => new Error('private-token-provider-payload\u001b[2J'), 'blocked'],
] as const)('shows a bounded localized failure without arbitrary provider or credential text', async (error, message) => {
  const f = fixture(); jest.mocked(createSetupPublisherInstallationCompositionRoot).mockImplementation(() => { throw error(); });
  await f.run(); expect(f.text()).toContain(resolveStaticSetupPublisherCatalog().message(message)); expect(f.text()).not.toContain('private-token-provider-payload'); expect(process.exitCode).toBe(message === 'cancelled' ? 130 : 1);
});
it('reports retained effects and an unconfirmed journal save truthfully', async () => {
  const f = fixture(); jest.mocked(createSetupPublisherInstallationCompositionRoot).mockImplementation(() => { throw new SetupPublisherApplyError('journal', f.operation, undefined); });
  await f.run(); expect(f.text()).toContain(f.operation.preparedCommit!); expect(f.text()).toContain('could not be saved'); expect(f.text()).toContain('Keep the operation ID');
});
it('explicit interruption revokes the active frontend, closes the terminal and leaves no completion claim', async () => {
  const f = fixture(), before = process.listeners('SIGINT'); jest.mocked(createInteractiveTerminalDriver).mockReturnValue(f.terminal);
  jest.mocked(createSetupPublisherInstallationCompositionRoot).mockImplementation((_token, presentation) => ({
    execute: async () => {
      expect(presentation.active()).toBe(true);
      const handler = process.listeners('SIGINT').find(listener => !before.includes(listener))!;
      handler('SIGINT'); expect(presentation.active()).toBe(false);
      throw new SetupPublisherReviewError('cancelled');
    },
  }) as unknown as ReturnType<typeof createSetupPublisherInstallationCompositionRoot>);
  await f.run(); expect(process.exitCode).toBe(130); expect(f.close).toHaveBeenCalled();
  expect(f.text()).not.toContain('Preview complete.'); expect(process.listeners('SIGINT')).toEqual(before);
});
it('an unchanged application result keeps native verification pending and creates no new approval prompt', async () => {
  const f = fixture(); const plan: SetupPublisherPlan = { ...f.plan, status: 'unchanged', files: [], approvalDigest: null };
  jest.mocked(createSetupPublisherInstallationCompositionRoot).mockImplementation((_token, presentation) => ({
    execute: async () => { await presentation.present(plan); return { plan, stage: 'unchanged' }; },
  }) as unknown as ReturnType<typeof createSetupPublisherInstallationCompositionRoot>);
  await f.run(); expect(f.text()).toContain('No empty PR was created.'); expect(f.readText).not.toHaveBeenCalled();
});
