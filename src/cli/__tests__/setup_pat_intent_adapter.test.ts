import { collectSetupPatIntent } from '../setup_pat_intent_adapter';
import { SetupCredentialPromptAdapter, SetupTerminalCancelledError } from '../setup_credential_prompt_adapter';
import { ConsoleSetupTokenPermissionPresenter } from '../setup_token_permission_presenter';
import { WebSetupBridge } from '../web_setup_bridge';
import type { TerminalReadResult } from '../../application/ports/setup_terminal_ports';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

function fixture() {
  const credentialPrompt = new SetupCredentialPromptAdapter(undefined, {});
  jest.spyOn(credentialPrompt, 'chooseSetupPatMethod').mockResolvedValue('guided');
  jest.spyOn(credentialPrompt, 'chooseSetupOwnerKind').mockResolvedValue('Organization');
  const guide = jest.spyOn(credentialPrompt, 'configureSetupPatGuide');
  const manual = jest.spyOn(credentialPrompt, 'useManualSetupPat');
  const permissionPresenter = new ConsoleSetupTokenPermissionPresenter();
  const detailed = jest.spyOn(permissionPresenter, 'showDetailedRequirements').mockImplementation(() => undefined);
  const initialRequirements: SetupTokenPermissionRequirement[] = [{ id: 'setup.repository.metadata', role: 'setup',
    scope: 'repository', permission: 'Metadata', level: 'read', applicability: 'required', reason: 'Identify selected targets.', probe: 'metadata' }];
  const bridge = new WebSetupBridge('acme/repo');
  const ask = jest.spyOn(bridge, 'ask').mockResolvedValue('Continue to GitHub');
  const input = { owner: 'acme', repository: 'repo', overrides: {}, skipRepositoryVariables: false,
    skipRepositorySecrets: false, configurationSource: 'organization' as const,
    credentialPrompt, permissionPresenter, initialRequirements, bridge };
  return { input, credentialPrompt, guide, manual, detailed, ask };
}
afterEach(() => jest.restoreAllMocks());
describe('guided existing-organization PAT access review', () => {
  it('links the reviewed least-privilege grants without collecting configuration or credentials', async () => {
    const f = fixture(); const result = await collectSetupPatIntent(f.input);
    expect(result).toEqual({ requirements: f.input.initialRequirements, assertedOwnerKind: 'Organization' });
    const url = new URL(f.guide.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ target_name: 'acme', expires_in: '1', metadata: 'read' });
    expect(f.ask).toHaveBeenCalledTimes(1); expect(f.ask).toHaveBeenCalledWith(expect.objectContaining({ copyId: 'setup.reusePatReview' }));
    expect(f.manual).not.toHaveBeenCalled();
  });
  it('uses the same bounded guide for batch Customize delivery', async () => {
    const f = fixture();
    await expect(collectSetupPatIntent({ ...f.input, configurationSource: 'customize', deliveryMode: 'pull-request' }))
      .resolves.toMatchObject({ assertedOwnerKind: 'Organization' });
    expect(f.ask).toHaveBeenCalledTimes(1); expect(f.guide).toHaveBeenCalledTimes(1);
  });
  it.each(['User', 'unknown'] as const)('blocks an unconfirmed organization owner: %s', async owner => {
    const f = fixture(); jest.mocked(f.credentialPrompt.chooseSetupOwnerKind).mockResolvedValue(owner);
    await expect(collectSetupPatIntent(f.input)).rejects.toThrow('requires an organization owner');
    expect(f.ask).not.toHaveBeenCalled(); expect(f.guide).not.toHaveBeenCalled();
  });
  it('retains the manual choice without inventing an owner assertion', async () => {
    const f = fixture(); f.ask.mockResolvedValue('Enter a PAT manually');
    expect(await collectSetupPatIntent(f.input)).toEqual({ requirements: f.input.initialRequirements });
    expect(f.manual).toHaveBeenCalledTimes(1); expect(f.guide).not.toHaveBeenCalled();
  });
  it('keeps browser cancellation distinct from manual entry', async () => {
    const f = fixture(); f.ask.mockResolvedValue(undefined);
    await expect(collectSetupPatIntent(f.input)).rejects.toBeInstanceOf(SetupTerminalCancelledError);
    expect(f.manual).not.toHaveBeenCalled(); expect(f.guide).not.toHaveBeenCalled();
  });
  it.each([
    { answer: { kind: 'value', value: '1' }, guided: true },
    { answer: { kind: 'value', value: '2' }, guided: false },
    { answer: { kind: 'cancel' }, guided: undefined },
  ] satisfies { answer: TerminalReadResult; guided: boolean | undefined }[])('respects the explicit terminal access decision: $answer.kind / $guided', async ({ answer, guided }) => {
    const f = fixture(); const terminal = { isInteractive: () => true, readText: jest.fn().mockResolvedValue(answer), readSecret: jest.fn(), close: jest.fn() };
    const result = collectSetupPatIntent({ ...f.input, bridge: undefined, terminal });
    if (guided === undefined) await expect(result).rejects.toBeInstanceOf(SetupTerminalCancelledError);
    else {
      await expect(result).resolves.toMatchObject({ requirements: f.input.initialRequirements });
      expect(f.guide).toHaveBeenCalledTimes(guided ? 1 : 0); expect(f.manual).toHaveBeenCalledTimes(guided ? 0 : 1);
    }
    expect(terminal.readSecret).not.toHaveBeenCalled();
  });
  it('offers manual entry when GitHub cannot prefill a required permission', async () => {
    const f = fixture(); f.input.initialRequirements[0] = { ...f.input.initialRequirements[0], permission: 'Unsupported' };
    await expect(collectSetupPatIntent(f.input)).resolves.toMatchObject({ assertedOwnerKind: 'Organization' });
    expect(f.manual).toHaveBeenCalledTimes(1); expect(f.guide).not.toHaveBeenCalled();
  });
  it('does not hide invalid target input as an unsupported-permission fallback', async () => {
    const f = fixture();
    await expect(collectSetupPatIntent({ ...f.input, owner: '../other' })).rejects.toThrow('Invalid PAT form');
    expect(f.manual).not.toHaveBeenCalled(); expect(f.guide).not.toHaveBeenCalled();
  });
});
