import { WebSetupBridge } from '../web_setup_bridge';

describe('WebSetupBridge', () => {
  test('publishes semantic prompts with one-use revisions and never echoes an answer', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const pending = bridge.ask({ kind: 'secret', title: 'Setup PAT' });
    const revision = bridge.snapshot().promptRevision!;
    expect(bridge.answer(revision + 1, 'secret-value')).toBe(false);
    expect(bridge.answer(revision, 'secret-value')).toBe(true);
    expect(await pending).toBe('secret-value');
    expect(bridge.answer(revision, 'secret-value')).toBe(false);
    expect(bridge.wasAnswered(revision)).toBe(true);
    expect(JSON.stringify(bridge.snapshot())).not.toContain('secret-value');
  });

  test('a second tab is read-only until takeover and old capabilities fail', () => {
    const bridge = new WebSetupBridge('owner/repo');
    const first = bridge.bootstrap();
    const second = bridge.bootstrap();
    expect(first.controller).toBe(true);
    expect(second.controller).toBe(false);
    expect(second.capability).toBeUndefined();
    expect(bridge.takeOver('invalid')).toBeUndefined();
    const replacement = bridge.takeOver(second.takeoverTicket)!;
    expect(bridge.isController(first.capability!)).toBe(false);
    expect(bridge.isController(replacement)).toBe(true);
    expect(bridge.takeOver(second.takeoverTicket)).toBeUndefined();
  });

  test('cancellation resolves a pending decision and forbids future prompts', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const pending = bridge.ask({ kind: 'text', title: 'Name' });
    bridge.cancel();
    expect(await pending).toBeUndefined();
    expect(bridge.snapshot().outcome).toBe('cancelled');
    await expect(bridge.ask({ kind: 'text', title: 'Again' })).rejects.toThrow('ended');
  });

  test('late messages and duplicate finishes cannot replace a terminal outcome', () => {
    const bridge = new WebSetupBridge('owner/repo');
    bridge.finish('partial', 'Inspect before retry');
    bridge.finish('complete', 'Done');
    expect(bridge.snapshot().outcome).toBe('partial');
    expect(bridge.snapshot().message?.text).toBe('Inspect before retry');
  });

  test('read-only subscribers receive redacted revisions and can unsubscribe', () => {
    const bridge = new WebSetupBridge('old/repo');
    const seen: number[] = [];
    const unsubscribe = bridge.subscribe(view => seen.push(view.revision));
    bridge.setRepository('owner/repo');
    bridge.message('Progress', 'info');
    unsubscribe();
    bridge.message('Later');
    expect(seen).toEqual([1, 2]);
    expect(bridge.snapshot().repository).toBe('owner/repo');
  });

  test('only one semantic decision can be pending at a time', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const pending = bridge.ask({ kind: 'choice', title: 'A', choices: ['yes'] });
    await expect(bridge.ask({ kind: 'text', title: 'B' })).rejects.toThrow('already pending');
    bridge.answer(bridge.snapshot().promptRevision!, 'yes');
    expect(await pending).toBe('yes');
  });

  test('rejects a value outside the visible choice without consuming the prompt', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const pending = bridge.ask({ kind: 'confirm', title: 'Apply?', choices: ['Apply setup', 'Stop'] });
    const revision = bridge.snapshot().promptRevision!;
    expect(bridge.answer(revision, 'yes')).toBe(false);
    expect(bridge.snapshot().promptRevision).toBe(revision);
    expect(bridge.answer(revision, 'Stop')).toBe(true);
    expect(await pending).toBe('Stop');
  });

  test('Apply cannot be cancelled once the mutation boundary started', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    bridge.setJourney({ repository: 'owner/repo', position: 6, total: 6, current: 'Apply', complete: [], pending: [], mutationStarted: true, choiceReviewPass: 1 });
    expect(bridge.cancel()).toBe(false);
    expect(bridge.snapshot().outcome).toBeUndefined();
    bridge.finish('partial', 'Inspect resources');
    expect(bridge.cancel()).toBe(false);
  });

  test('finishing resolves an unanswered prompt but preserves no secret', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const pending = bridge.ask({ kind: 'secret', title: 'PAT' });
    bridge.finish('blocked', 'Session expired');
    expect(await pending).toBeUndefined();
    expect(bridge.snapshot().prompt).toBeUndefined();
    expect(bridge.snapshot().outcome).toBe('blocked');
  });

  test('requirement/report projection exposes role and status only', () => {
    const bridge = new WebSetupBridge('owner/repo');
    bridge.requirements('setup', []);
    bridge.report({ role: 'setup', identityStatus: 'valid', identityMessage: 'checked', checks: [], ready: true, confirmationRequired: false });
    expect(bridge.snapshot().permissions).toMatchObject({ role: 'setup', report: { ready: true }, requirements: [] });
  });
});
