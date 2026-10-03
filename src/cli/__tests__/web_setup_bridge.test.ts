import { WebSetupBridge } from '../web_setup_bridge';

describe('WebSetupBridge', () => {
  test('read-only verification runs only after a completed setup and publishes counts without diagnostic values', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const run = jest.fn().mockResolvedValue({ healthy: false, pass: 3, warn: 1, fail: 0, skipped: 2,
      token: 'must-not-appear' });
    bridge.configureReadOnlyDoctor(run);
    expect(await bridge.runReadOnlyDoctor()).toBe('unavailable');
    bridge.finish('complete', 'Done');
    expect(await bridge.runReadOnlyDoctor()).toBe('complete');
    expect(await bridge.runReadOnlyDoctor()).toBe('complete');
    expect(run).toHaveBeenCalledTimes(1);
    expect(bridge.snapshot().doctor).toEqual({ status: 'complete', healthy: false, pass: 3, warn: 1, fail: 0, skipped: 2 });
    expect(JSON.stringify(bridge.snapshot())).not.toContain('must-not-appear');
  });
  test('read-only verification serializes no provider error and allows only one bounded retry', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const run = jest.fn().mockRejectedValue(new Error('private GitHub diagnostic'));
    bridge.configureReadOnlyDoctor(run);
    bridge.finish('complete', 'Done');
    expect(await bridge.runReadOnlyDoctor()).toBe('failed');
    expect(await bridge.runReadOnlyDoctor()).toBe('failed');
    expect(await bridge.runReadOnlyDoctor()).toBe('unavailable');
    expect(run).toHaveBeenCalledTimes(2);
    expect(bridge.snapshot().doctor).toEqual({ status: 'failed' });
    expect(JSON.stringify(bridge.snapshot())).not.toContain('private GitHub diagnostic');
  });
  test('keeps a redacted operation receipt and diagnostic reference together', () => {
    const bridge = new WebSetupBridge('owner/repo');
    bridge.setJourney({ repository: 'owner/repo', position: 6, total: 6, current: 'Apply', complete: [], pending: [], mutationStarted: true, choiceReviewPass: 1 });
    bridge.effects([{ id: 'files', state: 'completed' }, { id: 'secret', state: 'needs-inspection' }]);
    bridge.resultReason('provider', '12345678-1234-4123-8123-123456789abc');
    bridge.finish('partial', 'Inspect changes');
    expect(bridge.snapshot().resultDetail).toEqual(expect.objectContaining({ reasonCode: 'provider', diagnosticRef: '12345678-1234-4123-8123-123456789abc', effects: [
      { id: 'files', state: 'completed' }, { id: 'secret', state: 'needs-inspection' },
    ] }));
  });
  test('publishes live resource states and conservatively closes an interrupted write', () => {
    const bridge = new WebSetupBridge('owner/repo');
    bridge.setJourney({ repository: 'owner/repo', position: 6, total: 6, current: 'Apply', complete: [], pending: [], mutationStarted: true, choiceReviewPass: 1 });
    bridge.progress({ id: 'files', state: 'in-progress', scope: 'local' });
    bridge.progress({ id: 'files', state: 'completed', scope: 'local' });
    bridge.progress({ id: 'secrets', state: 'in-progress', scope: 'repository' });
    expect(bridge.snapshot().resultDetail?.effects).toEqual([
      { id: 'files', state: 'completed', scope: 'local' },
      { id: 'secrets', state: 'in-progress', scope: 'repository' },
    ]);
    bridge.finish('partial', 'Inspect before retry');
    expect(bridge.snapshot().resultDetail?.effects).toEqual([
      { id: 'files', state: 'completed', scope: 'local' },
      { id: 'secrets', state: 'needs-inspection', scope: 'repository' },
    ]);
    bridge.progress({ id: 'secrets', state: 'completed', scope: 'repository' });
    expect(bridge.snapshot().resultDetail?.effects?.[1].state).toBe('needs-inspection');
  });
  test('back navigation rotates the question revision without resolving or echoing a draft answer', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const commit = jest.fn();
    const pending = bridge.ask({ kind: 'text', title: 'Second' }, undefined,
      () => ({ prompt: { kind: 'text', title: 'First' }, commit }));
    const oldRevision = bridge.snapshot().promptRevision!;
    expect(bridge.back(oldRevision)).toBe('updated');
    expect(commit).toHaveBeenCalledTimes(1);
    const newRevision = bridge.snapshot().promptRevision!;
    expect(newRevision).toBeGreaterThan(oldRevision);
    expect(bridge.answer(oldRevision, 'stale')).toBe(false);
    expect(bridge.answer(newRevision, 'fresh')).toBe(true);
    expect(await pending).toBe('fresh');
    expect(JSON.stringify(bridge.snapshot())).not.toContain('fresh');
  });
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
    expect(JSON.stringify(second)).not.toContain('takeoverTicket');
    const replacement = bridge.takeOver();
    expect(bridge.isController(first.capability!)).toBe(false);
    expect(bridge.isController(replacement)).toBe(true);
  });

  test('cancellation resolves a pending decision and forbids future prompts', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const pending = bridge.ask({ kind: 'text', title: 'Name' });
    bridge.cancel();
    expect(await pending).toBeUndefined();
    expect(bridge.snapshot().outcome).toBe('cancelled');
    expect(bridge.snapshot().resultDetail).toEqual(expect.objectContaining({ reasonCode: 'cancelled', mutationStarted: false }));
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

  test('a failing subscriber is detached without losing prompts or blocking healthy observers', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const failed = jest.fn(() => { throw new Error('Observer failed'); });
    const seen: number[] = [];
    bridge.subscribe(failed);
    bridge.subscribe(view => seen.push(view.revision));
    const pending = bridge.ask({ kind: 'text', title: 'Continue setup' });
    const revision = bridge.snapshot().promptRevision!;
    expect(seen).toEqual([revision]);
    expect(bridge.answer(revision, 'yes')).toBe(true);
    expect(await pending).toBe('yes');
    bridge.message('Next step');
    expect(failed).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([revision, revision + 1, revision + 2]);
  });

  test('only one semantic decision can be pending at a time', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const pending = bridge.ask({ kind: 'choice', title: 'A', choices: ['yes'] });
    await expect(bridge.ask({ kind: 'text', title: 'B' })).rejects.toThrow('already pending');
    bridge.answer(bridge.snapshot().promptRevision!, 'yes');
    expect(await pending).toBe('yes');
  });

  test('explicit discovery retry updates the pending prompt in place without consuming its answer', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const pending = bridge.ask({ kind: 'text', title: 'Discovery' }, async () => ({
      prompt: { kind: 'text', title: 'Updated discovery' }, commit: jest.fn(),
    }));
    const revision = bridge.snapshot().promptRevision!;
    expect(await bridge.retryDiscovery(revision)).toBe('updated');
    expect(bridge.snapshot().promptRevision).toBe(revision);
    expect(bridge.snapshot().prompt).toMatchObject({ title: 'Updated discovery' });
    expect(bridge.answer(revision, 'kept choice')).toBe(true);
    expect(await pending).toBe('kept choice');
    expect(await bridge.retryDiscovery(revision)).toBe('stale');
  });

  test('a retry cannot commit after cancellation or a controller takeover', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    const first = bridge.bootstrap();
    let finish!: (value: { prompt: { kind: 'text'; title: string }; commit: () => void }) => void;
    const commit = jest.fn();
    const pending = bridge.ask({ kind: 'text', title: 'Original' }, () => new Promise(resolve => { finish = resolve; }));
    const revision = bridge.snapshot().promptRevision!;
    const retry = bridge.retryDiscovery(revision);
    expect(bridge.answer(revision, 'racing answer')).toBe(false);
    bridge.takeOver();
    expect(bridge.isController(first.capability!)).toBe(false);
    finish({ prompt: { kind: 'text', title: 'Stale' }, commit });
    expect(await retry).toBe('stale');
    expect(commit).not.toHaveBeenCalled();
    expect(bridge.snapshot().prompt).toMatchObject({ title: 'Original' });
    bridge.cancel();
    expect(await pending).toBeUndefined();
  });

  test('cancelling while discovery is in flight discards its result and leaves no pending answer', async () => {
    const bridge = new WebSetupBridge('owner/repo');
    let finish!: (value: { prompt: { kind: 'text'; title: string }; commit: () => void }) => void;
    const commit = jest.fn();
    const pending = bridge.ask({ kind: 'text', title: 'Original' }, () => new Promise(resolve => { finish = resolve; }));
    const revision = bridge.snapshot().promptRevision!;
    const retry = bridge.retryDiscovery(revision);
    await expect(bridge.retryDiscovery(revision)).resolves.toBe('unavailable');
    expect(bridge.cancel()).toBe(true);
    finish({ prompt: { kind: 'text', title: 'Late' }, commit });
    expect(await retry).toBe('stale');
    expect(commit).not.toHaveBeenCalled();
    expect(await pending).toBeUndefined();
    expect(bridge.snapshot().prompt).toBeUndefined();
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

  test('blocked result retains a specific safe reason and stage, without raw provider text', () => {
    const bridge = new WebSetupBridge('owner/repo');
    bridge.setJourney({ repository: 'owner/repo', position: 4, total: 6, current: 'Plan', complete: [], pending: [], mutationStarted: false, choiceReviewPass: 1 });
    bridge.resultReason('permissions');
    bridge.finish('blocked', 'Full terminal details');
    expect(bridge.snapshot().resultDetail).toEqual({ reasonCode: 'permissions', stoppedStage: 'Plan', mutationStarted: false });
    expect(JSON.stringify(bridge.snapshot().resultDetail)).not.toContain('Full terminal details');
  });

  test('requirement/report projection exposes role and status only', () => {
    const bridge = new WebSetupBridge('owner/repo');
    bridge.requirements('setup', []);
    bridge.report({ role: 'setup', identityStatus: 'valid', identityMessage: 'checked', checks: [], ready: true, confirmationRequired: false });
    expect(bridge.snapshot().permissions).toMatchObject({ role: 'setup', report: { ready: true }, requirements: [] });
  });

  test('blocked PAT result retains its redacted permission report after the prompt closes', () => {
    const bridge = new WebSetupBridge('owner/repo');
    bridge.report({ role: 'setup', identityStatus: 'valid', identityMessage: 'checked',
      ready: false, confirmationRequired: false, checks: [{ id: 'setup.organization.projects',
        role: 'setup', scope: 'organization', permission: 'Projects', level: 'read',
        applicability: 'required', reason: 'Inspect selected Projects.', probe: 'projects',
        status: 'unverifiable', message: 'No safe read evidence.' }] });
    bridge.resultReason('permissions');
    bridge.finish('blocked', 'No further setup changes will be applied.');
    expect(bridge.snapshot().permissions?.report?.checks[0]).toMatchObject({ permission: 'Projects', status: 'unverifiable' });
    expect(JSON.stringify(bridge.snapshot())).not.toContain('secret-token');
  });
});
