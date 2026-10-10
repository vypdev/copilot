import { WebSetupBridge } from '../web_setup_bridge';
import { WebSetupCredentialPrompt } from '../web_setup_adapters';
import { SetupCredentialsUseCase } from '../../application/usecases/setup/setup_credentials_use_case';
import { VerifyGuidedWorkflowPatIdentityUseCase } from '../../application/usecases/setup/verify_guided_workflow_pat_identity_use_case';
import { SetupInteractionCancelledError } from '../../application/errors/setup_interaction_cancelled_error';

const next = () => new Promise<void>(resolve => setImmediate(resolve));

function fixture() {
  const bridge = new WebSetupBridge('owner/repo');
  const prompt = new WebSetupCredentialPrompt(bridge);
  const identities = { resolve: jest.fn().mockResolvedValue({ id: 42, login: 'vypbot' }),
    identify: jest.fn().mockResolvedValueOnce({ id: 99, login: 'operator' }).mockResolvedValue({ id: 42, login: 'vypbot' }) };
  prompt.configureWorkflowPatGuide('https://github.com/settings/personal-access-tokens/new?name=bot', identities.resolve);
  const audit = { inspect: jest.fn().mockResolvedValue({ ready: true, identityStatus: 'valid', checks: [] }) };
  const collect = new SetupCredentialsUseCase(prompt,
    { validateSetupPat: jest.fn().mockResolvedValue({ status: 'valid', message: 'ok' }), validateCredential: jest.fn() },
    { list: jest.fn().mockResolvedValue([]) }, undefined, audit, undefined, new VerifyGuidedWorkflowPatIdentityUseCase(identities));
  const answer = async (value: string) => {
    expect(bridge.answer(bridge.snapshot().promptRevision!, value)).toBe(true);
    await next();
  };
  return { bridge, identities, audit, answer, collect: () => collect.collect({ owner: 'owner', repository: 'repo',
    setupToken: 'setup-token', manageSecrets: true,
    requirements: [{ name: 'PAT', kind: 'workflowPat', description: 'Runtime' }],
    workflowTokenPermissions: [{ id: 'contents', role: 'workflow', scope: 'repository', permission: 'Contents',
      level: 'write', applicability: 'required', reason: 'Write repository', probe: 'contents' }],
  }) };
}

describe('web bot PAT recovery handoff', () => {
  test('waits for an explicit correction and keeps the selected bot and session before auditing the replacement', async () => {
    const f = fixture();
    const views: string[] = [];
    f.bridge.subscribe(view => views.push(JSON.stringify(view)));
    const pending = f.collect();
    await next();
    await f.answer('Guided GitHub link');
    await f.answer('vypbot');
    const rejectedRevision = f.bridge.snapshot().promptRevision!;
    await f.answer('wrong-token');
    expect(f.bridge.snapshot()).toMatchObject({ prompt: { kind: 'choice', copyId: 'botPat.identityMismatch',
      copyValues: { expected: 'vypbot', actual: 'operator' } } });
    expect(f.bridge.snapshot().outcome).toBeUndefined();
    expect(f.audit.inspect).not.toHaveBeenCalled();
    expect(f.bridge.answer(rejectedRevision, 'wrong-token')).toBe(false);
    await f.answer('Enter another bot PAT');
    expect(f.bridge.snapshot().prompt).toMatchObject({ kind: 'secret', copyId: 'botPat.entry.guided',
      copyValues: { account: 'vypbot', accountId: '42' }, link: expect.stringContaining('name=bot') });
    expect(f.identities.resolve).toHaveBeenCalledTimes(1);
    await f.answer('correct-token');
    await expect(pending).resolves.toMatchObject({ collection: { workflowPat: { value: 'correct-token' } } });
    expect(f.audit.inspect).toHaveBeenCalledTimes(1);
    expect(f.audit.inspect).toHaveBeenCalledWith(expect.objectContaining({ token: 'correct-token' }));
    expect(views.join('\n')).not.toMatch(/wrong-token|correct-token/u);
  });

  test.each(['stop', 'close'] as const)('honors explicit %s at the account mismatch without re-entering credentials', async action => {
    const f = fixture();
    const pending = f.collect();
    const rejected = expect(pending).rejects.toBeInstanceOf(SetupInteractionCancelledError);
    await next();
    await f.answer('Guided GitHub link');
    await f.answer('vypbot');
    await f.answer('wrong-token');
    if (action === 'stop') await f.answer('Stop setup');
    else expect(f.bridge.cancel()).toBe(true);
    await rejected;
    expect(f.audit.inspect).not.toHaveBeenCalled();
    expect(f.identities.identify).toHaveBeenCalledTimes(1);
  });
});
