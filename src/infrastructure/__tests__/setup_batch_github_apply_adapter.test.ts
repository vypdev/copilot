import { DeliverSetupInstallationUseCase } from '../../application/usecases/setup/deliver_setup_installation_use_case';
import { SetupBatchGithubApplyAdapter } from '../setup_batch_github_apply_adapter';
import { SetupBatchGithubReadAdapter, SetupBatchGithubTransport, SetupBatchProviderError } from '../setup_batch_github_read_adapter';
import { beginSetupBatchOperation, setupBatchBranch, setupBatchMarker } from '../../application/policies/setup_batch_policy';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import type { SetupBatchOperation, SetupBatchTargetPlan } from '../../domain/setup_batch';
import type { SetupRemoteConfiguration } from '../../domain/setup';
import { createHash } from 'node:crypto';
import { setupInstallationTreeFixture } from './fixtures/setup_installation_tree_fixture';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ApplySetupBatchUseCase } from '../../application/usecases/setup/apply_setup_batch_use_case';
import { ApplySetupPublisherUseCase } from '../../application/usecases/setup/apply_setup_publisher_use_case';
import { ReviewSetupPublisherUseCase } from '../../application/usecases/setup/review_setup_publisher_use_case';
import { InstallSetupPublisherUseCase } from '../../application/usecases/setup/install_setup_publisher_use_case';
import { setupPublisherFixture } from '../../application/policies/__tests__/fixtures/setup_publisher_fixture';
import { SetupBatchJournalAdapter } from '../setup_batch_journal_adapter';
import { SetupPublisherJournalAdapter } from '../setup_publisher_journal_adapter';
// Observation only: retain slow/pending journal phases without changing I/O or test bounds.
jest.requireActual<{ installJournalIoDiagnostics(): void }>('./fixtures/journal_io_diagnostics.cjs').installJournalIoDiagnostics();
const operation = 'a67c8e40-93be-43ed-a7ed-e07378c7e773';
const base = 'a'.repeat(40); const prepared = 'c'.repeat(40);
function fixture() {
  const target = { id: 7, ownerId: 3, owner: 'acme', name: 'repo', defaultBranch: 'master', baseSha: base,
    private: true, archived: false, disabled: false, canPush: true };
  const remote: SetupRemoteConfiguration = { ownerType: 'Organization', repositoryId: 7, repositoryVisibility: 'private',
    defaultBranch: 'master', repositoryVariables: [], organizationVariables: [], repositorySecrets: [], organizationSecrets: ['PAT'],
    repositoryVariablesAccess: 'available', organizationVariablesAccess: 'available', repositorySecretsAccess: 'available',
    organizationSecretsAccess: 'available', organizationAccess: 'available' };
  const plan: SetupBatchTargetPlan = { target, remote, configuration: createDefaultSetupConfiguration(), digest: 'b'.repeat(64),
    blocked: [], files: [{ path: 'AGENTS.md', content: 'generated guidance' }], repositoryVariables: [], grants: [], sharedSnapshot: [] };
  let branch: string | undefined; let pulls: unknown[] = []; let returnedReceiptManifest: string | undefined;
  const installation = { schemaVersion: 1, operationId: operation, repositoryId: 7, baseSha: base, planDigest: plan.digest };
  const baseFiles = new Map([['.github/workflows/obsolete.yml', 'old fixture']]);
  const preparedFiles = new Map([...baseFiles, ['AGENTS.md', plan.files[0].content!], ['.copilot/setup-manifest.json', JSON.stringify({ schemaVersion: 2,
    generator: { name: '@vypdev/copilot', contractVersion: 1 }, artifacts: {}, profileDigest: createHash('sha256').update('').digest('hex'), installation }, null, 2) + '\n']]);
  const baseTree = setupInstallationTreeFixture(baseFiles);
  const request = jest.fn(async (route: string, parameters: Record<string, unknown>): Promise<{ data: unknown }> => {
    if (route === 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}') return { data: parameters.commit_sha === base
      ? { sha: base, tree: { sha: baseTree.root } } : { sha: prepared, parents: [{ sha: base }], tree: { sha: setupInstallationTreeFixture(preparedFiles).root } } };
    if (route === 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}') return { data: baseTree.trees.get(String(parameters.tree_sha))
      ?? setupInstallationTreeFixture(preparedFiles).trees.get(String(parameters.tree_sha)) };
    if (route === 'GET /repos/{owner}/{repo}/contents/{path}') return { data: { encoding: 'base64',
      content: Buffer.from(returnedReceiptManifest ?? preparedFiles.get('.copilot/setup-manifest.json')!).toString('base64') } };
    if (route === 'POST /repos/{owner}/{repo}/git/trees') {
      for (const file of parameters.tree as { path: string; content?: string; sha?: null }[]) {
        if (file.sha === null) preparedFiles.delete(file.path); else preparedFiles.set(file.path, file.content!);
      }
      return { data: { sha: setupInstallationTreeFixture(preparedFiles).root } };
    }
    if (route === 'POST /repos/{owner}/{repo}/git/commits') return { data: { sha: prepared } };
    if (route === 'GET /repos/{owner}/{repo}/git/ref/{ref}') {
      if (!branch) throw new SetupBatchProviderError('not-found'); return { data: { object: { sha: branch } } };
    }
    if (route === 'POST /repos/{owner}/{repo}/git/refs') { branch = String(parameters.sha); return { data: {} }; }
    if (route === 'GET /repos/{owner}/{repo}/pulls') return { data: pulls };
    if (route === 'POST /repos/{owner}/{repo}/pulls') { pulls = [pull()]; return { data: pull() }; }
    throw new Error('Unexpected fixed route');
  });
  const read = new SetupBatchGithubReadAdapter(new SetupBatchGithubTransport({ getClient: () => ({ request }) }), { inspect: async () => remote });
  jest.spyOn(read, 'resolve').mockResolvedValue(target); jest.spyOn(read, 'shared').mockResolvedValue([]);
  jest.spyOn(read, 'sharedMetadata').mockResolvedValue([]);
  const shared = jest.spyOn(read, 'sharedResource');
  jest.spyOn(read, 'branchExists').mockResolvedValue(true);
  jest.spyOn(read, 'files').mockResolvedValue([]);
  const variableWriter = { createMissing: jest.fn(async () => ({ created: 1, updated: 0, errors: [] as string[] })), upsert: jest.fn(async () => ({ created: 1, updated: 0, errors: [] as string[] })), upsertScopedVariables: jest.fn() };
  const resources = { labels: jest.fn(async () => undefined), issueTypes: jest.fn(async () => undefined) };
  const writer = new SetupBatchGithubApplyAdapter(read, variableWriter, resources);
  function pull() { return { number: 31, state: 'open', body: setupBatchMarker(operation, 7),
    head: { ref: setupBatchBranch(operation), sha: prepared, repo: { id: 7 } }, base: { ref: 'master', repo: { id: 7 } } }; }
  return { plan, writer, request, read, shared, variableWriter, resources, pull, baseTree,
    setBranch: (sha: string | undefined) => { branch = sha; }, setPulls: (values: unknown[]) => { pulls = values; },
    setReceipt: (value: unknown) => { returnedReceiptManifest = JSON.stringify({ installation: value }); } };
}
async function recoveryFixture(options: { active?: () => boolean; writer?: (writer: SetupBatchGithubApplyAdapter) => void } = {}) {
  const f = fixture(), directory = await mkdtemp(join(tmpdir(), 'batch-reviewed-recovery-'));
  const journal = new SetupBatchJournalAdapter(directory), review = jest.fn(async () => true);
  const plan = { operationId: operation, organization: 'acme', targets: [f.plan] };
  // Reconstruct the writer and use the real closed-v1 journal on each reviewed resume.
  const execute = () => {
    const writer = new SetupBatchGithubApplyAdapter(f.read, f.variableWriter, f.resources);
    options.writer?.(writer);
    return new ApplySetupBatchUseCase({ coordinator: new DeliverSetupInstallationUseCase(), journal, writer,
      presentation: { review, active: options.active ?? (() => true), progress: () => undefined } }).execute(plan, 'private-recovery-fixture');
  };
  const receipt = async (): Promise<SetupBatchOperation> => JSON.parse(await readFile(join(directory, operation + '.json'), 'utf8'));
  const posts = (route: string) => f.request.mock.calls.filter(([actual]) => actual === `POST /repos/{owner}/{repo}/${route}`);
  return { ...f, journal, execute, review, receipt, posts, cleanup: () => rm(directory, { recursive: true, force: true }) };
}
describe('freshly reviewed legacy batch recovery through real Git delivery', () => {
  it.each((['branch', 'pull-request'] as const).flatMap(phase => (['drift', 'cancelled'] as const).map(reason => ({ phase, reason }))))(
    'publisher-inventory-C58: ordinary batch retains verified $phase after $reason and preserves its existing recovery policy without inventory authority', async ({ phase, reason }) => {
      let active = true;
      const f = await recoveryFixture({ active: () => active });
      try {
        const selected = `POST /repos/{owner}/{repo}/${phase === 'branch' ? 'git/refs' : 'pulls'}`;
        const original = f.request.getMockImplementation()!; let changed = false;
        f.request.mockImplementation(async (route, parameters) => {
          const result = await original(route, parameters);
          if (!changed && route === selected) {
            changed = true;
            if (reason === 'cancelled') active = false;
            else jest.mocked(f.read.resolve).mockResolvedValue({ ...f.plan.target, baseSha: 'd'.repeat(40) });
          }
          return result;
        });
        const first = await f.execute();
        expect(changed).toBe(true);
        expect(first).toMatchObject({ schemaVersion: 1, targets: [{ status: reason === 'drift' ? 'blocked' : 'cancelled', reason, preparedCommit: prepared,
          effects: ['access', 'variables', 'labels', 'issue-types', 'branch', ...(phase === 'pull-request' ? ['pull-request'] : [])],
          ...(phase === 'pull-request' ? { pullRequestNumber: 31 } : {}) }] });
        expect(await f.receipt()).toEqual(JSON.parse(JSON.stringify(first)));
        expect(f.posts('pulls')).toHaveLength(phase === 'pull-request' ? 1 : 0);
        active = true; jest.mocked(f.read.resolve).mockResolvedValue(f.plan.target);
        const second = await f.execute();
        if (reason === 'drift') expect(second).toEqual(first); // Legacy blocked records are terminal, even after a new review.
        else expect(second.targets[0]).toMatchObject({ status: 'waiting-for-merge', pullRequestNumber: 31 });
        expect(f.review).toHaveBeenCalledTimes(2); expect(f.resources.labels).toHaveBeenCalledTimes(1);
        expect(f.resources.issueTypes).toHaveBeenCalledTimes(1);
        expect(f.variableWriter.createMissing).not.toHaveBeenCalled(); expect(f.variableWriter.upsert).not.toHaveBeenCalled();
        expect(f.variableWriter.upsertScopedVariables).not.toHaveBeenCalled();
        for (const route of ['git/trees', 'git/commits', 'git/refs']) expect(f.posts(route)).toHaveLength(1);
        expect(f.posts('pulls')).toHaveLength(reason === 'drift' && phase === 'branch' ? 0 : 1);
        const retained = JSON.stringify(await f.receipt());
        expect(retained).not.toContain('inventoryReview'); expect(retained).not.toContain('private-recovery-fixture');
        expect(f.request.mock.calls.some(([route]) => /reviews|collaborators/.test(route))).toBe(false);
      } finally { await f.cleanup(); }
    });
  it('publisher977-C96: cancelled preparation intent resumes through the real v1 journal without repeating resources', async () => {
    let active = true, cancelled = false, preparedResourceSaves = 0;
    const f = await recoveryFixture({ active: () => active });
    try {
      const save = f.journal.save.bind(f.journal);
      jest.spyOn(f.journal, 'save').mockImplementation(async state => {
        await save(state);
        const target = state.targets[0];
        // The first matching save completes issue-types; the second retains
        // the common coordinator's preparation intent before any command.
        if (!cancelled && target.status === 'applying' && target.effects.length === 4 && target.reason === undefined && ++preparedResourceSaves === 2) {
          cancelled = true; active = false;
        }
      });
      expect((await f.execute()).targets[0]).toMatchObject({ status: 'cancelled', reason: 'preflight' });
      expect(cancelled).toBe(true); expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
      const retained = await f.receipt(); expect(retained.targets[0]).toMatchObject({ status: 'cancelled', reason: 'preflight' });
      active = true;
      expect((await f.execute()).targets[0]).toMatchObject({ status: 'waiting-for-merge', preparedCommit: prepared, pullRequestNumber: 31 });
      expect(f.review).toHaveBeenCalledTimes(2); expect(f.resources.labels).toHaveBeenCalledTimes(1);
      expect(f.resources.issueTypes).toHaveBeenCalledTimes(1); expect(f.posts('git/trees')).toHaveLength(1);
    } finally { await f.cleanup(); }
  });
  it.each((['tree', 'commit', 'branch', 'pull-request'] as const).flatMap(phase =>
    (['freshness-read', 'Git-proof-read'] as const).map(boundary => ({ phase, boundary }))))(
    'publisher977-C95: cancellation during $phase $boundary stops the real provider write and retains prior facts', async ({ phase, boundary }) => {
      let active = true, triggered = false, dispatch: 'prepare' | 'branch' | 'pull-request' | undefined;
      const f = await recoveryFixture({ active: () => active, writer: writer => {
        const prepareCommit = writer.prepareCommit.bind(writer), branch = writer.branch.bind(writer), pullRequest = writer.pullRequest.bind(writer);
        jest.spyOn(writer, 'prepareCommit').mockImplementation((...args) => { dispatch = 'prepare'; return prepareCommit(...args); });
        jest.spyOn(writer, 'branch').mockImplementation((...args) => { dispatch = 'branch'; return branch(...args); });
        jest.spyOn(writer, 'pullRequest').mockImplementation((...args) => { dispatch = 'pull-request'; return pullRequest(...args); });
      } });
      try {
        const posts = ['git/trees', 'git/commits', 'git/refs', 'pulls'].map(route => `POST /repos/{owner}/{repo}/${route}`);
        const before = ['tree', 'commit', 'branch', 'pull-request'].indexOf(phase);
        const inPhase = () => dispatch === (phase === 'tree' || phase === 'commit' ? 'prepare' : phase)
          && f.request.mock.calls.filter(([route]) => route.startsWith('POST ')).length === before;
        const cancel = () => { active = false; triggered = true; };
        if (boundary === 'freshness-read') {
          const effective = f.read.effective.bind(f.read);
          jest.spyOn(f.read, 'effective').mockImplementation(async (...args) => {
            const result = await effective(...args);
            const hasBaseRead = f.request.mock.calls.some(([route, parameters]) =>
              route === 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}' && parameters.commit_sha === base);
            if (inPhase() && (phase !== 'tree' || hasBaseRead)) cancel();
            return result;
          });
        } else {
          const original = f.request.getMockImplementation()!;
          const selected = (route: string, parameters: Record<string, unknown>) => inPhase() && (
            phase === 'tree' ? route === 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}' && parameters.commit_sha === base
              : phase === 'commit' ? route === 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}'
                : phase === 'branch' ? route === 'GET /repos/{owner}/{repo}/git/ref/{ref}'
                  : route === 'GET /repos/{owner}/{repo}/pulls');
          f.request.mockImplementation(async (route, parameters) => {
            try {
              const result = await original(route, parameters);
              if (selected(route, parameters)) cancel();
              return result;
            } catch (error) {
              if (selected(route, parameters)) cancel();
              throw error;
            }
          });
        }
        const result = await f.execute();
        expect(triggered).toBe(true); expect(active).toBe(false);
        expect(f.request.mock.calls.filter(([route]) => route.startsWith('POST ')).map(([route]) => route)).toEqual(posts.slice(0, before));
        expect(result.targets[0]).toMatchObject({ status: 'cancelled', reason: phase === 'tree' ? 'preflight' : 'cancelled',
          effects: ['access', 'variables', 'labels', 'issue-types', ...(phase === 'pull-request' ? ['branch'] : [])],
          preparedCommit: phase === 'branch' || phase === 'pull-request' ? prepared : undefined });
        expect(await f.receipt()).toEqual(JSON.parse(JSON.stringify(result)));
        expect(f.resources.labels).toHaveBeenCalledTimes(1); expect(f.resources.issueTypes).toHaveBeenCalledTimes(1);
        expect(f.review).toHaveBeenCalledTimes(1);
      } finally { await f.cleanup(); }
    },
  );
  it.each(['manifest-read', 'base-commit-read'] as const)('retries a confirmed pre-POST %s failure without repeating resources', async failure => {
    const f = await recoveryFixture();
    try {
      if (failure === 'manifest-read') jest.mocked(f.read.files).mockRejectedValueOnce(new Error('inventory unavailable'));
      else {
        const original = f.request.getMockImplementation()!; let failed = false;
        f.request.mockImplementation(async (route, parameters) => {
          if (!failed && route === 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}') {
            failed = true; throw new SetupBatchProviderError('unknown');
          }
          return original(route, parameters);
        });
      }
      const first = await f.execute();
      expect(first.targets[0]).toMatchObject({ status: 'partial', reason: 'preflight',
        effects: ['access', 'variables', 'labels', 'issue-types'] });
      expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
      expect(await f.receipt()).toEqual(JSON.parse(JSON.stringify(first)));
      expect((await f.execute()).targets[0]).toMatchObject({ status: 'waiting-for-merge', preparedCommit: prepared, pullRequestNumber: 31 });
      expect(f.review).toHaveBeenCalledTimes(2); expect(f.resources.labels).toHaveBeenCalledTimes(1);
      expect(f.resources.issueTypes).toHaveBeenCalledTimes(1);
      for (const route of ['git/trees', 'git/commits', 'git/refs', 'pulls']) expect(f.posts(route)).toHaveLength(1);
      expect(JSON.stringify(await f.receipt())).not.toContain('private-recovery-fixture');
    } finally { await f.cleanup(); }
  });
  it('retains a known commit when its later proof read fails and never repeats object creation', async () => {
    const f = await recoveryFixture();
    try {
      const original = f.request.getMockImplementation()!; let failed = false;
      f.request.mockImplementation(async (route, parameters) => {
        if (!failed && route === 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}' && parameters.commit_sha === prepared) {
          failed = true; throw new SetupBatchProviderError('unknown');
        }
        return original(route, parameters);
      });
      expect((await f.execute()).targets[0]).toMatchObject({ status: 'partial', preparedCommit: prepared });
      expect((await f.execute()).targets[0].status).toBe('waiting-for-merge');
      expect(f.posts('git/trees')).toHaveLength(1); expect(f.posts('git/commits')).toHaveLength(1);
    } finally { await f.cleanup(); }
  });
  it.each([
    ['ref-read', 'GET /repos/{owner}/{repo}/git/ref/{ref}', 'git/refs', 1],
    ['ref-create', 'POST /repos/{owner}/{repo}/git/refs', 'git/refs', 2],
    ['PR-read', 'GET /repos/{owner}/{repo}/pulls', 'pulls', 1],
    ['PR-create', 'POST /repos/{owner}/{repo}/pulls', 'pulls', 2],
  ] as const)('reinspects and creates a confirmed absent target after %s failure and fresh review', async (_name, failedRoute, createdRoute, attempts) => {
    const f = await recoveryFixture();
    try {
      const original = f.request.getMockImplementation()!; let failed = false;
      f.request.mockImplementation(async (route, parameters) => {
        if (!failed && route === failedRoute) { failed = true; throw new SetupBatchProviderError('unknown'); }
        return original(route, parameters);
      });
      expect((await f.execute()).targets[0]).toMatchObject({ status: 'partial', preparedCommit: prepared });
      expect((await f.execute()).targets[0]).toMatchObject({ status: 'waiting-for-merge', pullRequestNumber: 31 });
      expect(f.review).toHaveBeenCalledTimes(2); expect(f.resources.labels).toHaveBeenCalledTimes(1);
      expect(f.posts('git/trees')).toHaveLength(1); expect(f.posts('git/commits')).toHaveLength(1);
      expect(f.posts(createdRoute)).toHaveLength(attempts);
    } finally { await f.cleanup(); }
  });
  it.each(['git/trees', 'git/commits'] as const)('never repeats an unknown %s POST without its object identity', async failedRoute => {
    const f = await recoveryFixture();
    try {
      const original = f.request.getMockImplementation()!;
      f.request.mockImplementation(async (route, parameters) => {
        if (route === `POST /repos/{owner}/{repo}/${failedRoute}`) throw new SetupBatchProviderError('unknown');
        return original(route, parameters);
      });
      expect((await f.execute()).targets[0]).toMatchObject({ status: 'partial', reason: 'provider' });
      expect((await f.execute()).targets[0]).toMatchObject({ status: 'partial', reason: 'provider' });
      expect(f.posts(failedRoute)).toHaveLength(1); expect(f.posts('git/refs')).toHaveLength(0); expect(f.posts('pulls')).toHaveLength(0);
    } finally { await f.cleanup(); }
  });
});
describe('installer-owned GitHub write boundaries', () => {
  it('rejects malformed legacy manifest JSON before Git delivery without echoing its content', async () => {
    const f = fixture(), plan = { ...f.plan, files: [{ path: '.copilot/setup-manifest.json', content: '{untrusted-manifest-payload' }] };
    await expect(f.writer.branch(plan, operation, prepared, 'fixture')).rejects.toThrow('malformed');
    expect(f.request).not.toHaveBeenCalled(); expect(f.resources.labels).not.toHaveBeenCalled();
    expect(f.variableWriter.createMissing).not.toHaveBeenCalled();
  });
  it('publisher977-C60: preserves ordinary resource delivery and Secrets while the publisher cannot adopt its real v1 operation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'publisher-cross-route-'));
    try {
      const f = fixture();
      const remote: SetupRemoteConfiguration = { ...f.plan.remote, repositorySecrets: ['LOCAL_PAT'],
        repositorySecretRevisions: [{ name: 'LOCAL_PAT', updatedAt: '2026-11-21T00:00:00Z' }] };
      const effective = { ...remote, repositoryVariables: [...remote.repositoryVariables] };
      jest.spyOn(f.read, 'effective').mockImplementation(async () => effective);
      const variable = { name: 'EXAMPLE_SETTING', value: 'reviewed-value' };
      f.variableWriter.createMissing.mockImplementation(async () => {
        effective.repositoryVariables.push(variable); return { created: 1, updated: 0, errors: [] };
      });
      const target = { ...f.plan, remote, repositoryVariables: [variable] };
      const batchJournal = new SetupBatchJournalAdapter(directory);
      const result = await new ApplySetupBatchUseCase({ coordinator: new DeliverSetupInstallationUseCase(), writer: f.writer, journal: batchJournal,
        presentation: { review: async () => true, active: () => true, progress: () => undefined } })
        .execute({ operationId: operation, organization: 'acme', targets: [target] }, 'private-cross-route-fixture');
      expect(result.targets[0]).toMatchObject({ status: 'waiting-for-merge', pullRequestNumber: 31,
        effects: ['access', 'variables', 'labels', 'issue-types', 'branch', 'pull-request'] });
      expect(f.variableWriter.createMissing).toHaveBeenCalledWith('acme', 'repo', 'private-cross-route-fixture', [variable]);
      expect(f.variableWriter.upsert).not.toHaveBeenCalled(); expect(f.variableWriter.upsertScopedVariables).not.toHaveBeenCalled();
      expect(f.resources.labels).toHaveBeenCalledTimes(1); expect(f.resources.issueTypes).toHaveBeenCalledTimes(1);
      expect(remote.repositorySecrets).toEqual(['LOCAL_PAT']); expect(remote.organizationSecrets).toEqual(['PAT']);
      expect(f.request.mock.calls.filter(([route]) => !route.startsWith('GET ')).map(([route]) => route)).toEqual([
        'POST /repos/{owner}/{repo}/git/trees', 'POST /repos/{owner}/{repo}/git/commits',
        'POST /repos/{owner}/{repo}/git/refs', 'POST /repos/{owner}/{repo}/pulls',
      ]);
      const receiptPath = join(directory, operation + '.json'), before = await readFile(receiptPath, 'utf8');
      expect(JSON.parse(before)).toMatchObject({ schemaVersion: 1, targets: [{ status: 'waiting-for-merge' }] });
      expect(before).not.toMatch(/private-cross-route-fixture|reviewed-value|LOCAL_PAT/u);
      const data = setupPublisherFixture(), publisherJournal = new SetupPublisherJournalAdapter(directory);
      const inspect = jest.fn(async () => ({ inspection: data.inspection, session: {} }));
      const confirm = jest.fn(async () => 'approve' as const), present = jest.fn(async () => undefined);
      const delivery = jest.fn(() => { throw new Error('Cross-purpose delivery must never start.'); });
      const publisher = new InstallSetupPublisherUseCase(new ReviewSetupPublisherUseCase({ inspect, confirm, present, active: () => true }),
        new ApplySetupPublisherUseCase({ coordinator: new DeliverSetupInstallationUseCase(), journal: publisherJournal, active: () => true, delivery }), publisherJournal);
      const requests = f.request.mock.calls.length;
      await expect(publisher.execute({ proposal: data.proposal, operationId: operation, dryRun: false, resume: true }))
        .rejects.toMatchObject({ reason: 'journal' });
      expect(inspect).not.toHaveBeenCalled(); expect(present).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled(); expect(delivery).not.toHaveBeenCalled();
      expect(f.request).toHaveBeenCalledTimes(requests); expect(await readFile(receiptPath, 'utf8')).toBe(before);
      expect(await readdir(directory)).toEqual([operation + '.json']);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('snapshots a shared runner profile without granting registry or group access and blocks drift', async () => {
    const f = fixture(); const profile = { id: 'shared', group: 'vypdev', labels: ['self-hosted', 'Linux'], validation: 'hosted' as const };
    const value = JSON.stringify({ schemaVersion: 1, profiles: [profile] });
    const resource = { kind: 'variable' as const, name: 'COPILOT_RUNNER_PROFILES', value, visibility: 'selected' as const, updatedAt: '2026-10-18T00:00:00Z', selectedRepositoryIds: [999] };
    const configuration = { ...f.plan.configuration, runners: { mode: 'organization-profile' as const, profileId: profile.id,
      group: profile.group, labels: profile.labels, validation: profile.validation, source: { scope: 'organization' as const, value } } };
    const plan = { ...f.plan, configuration };
    const effective = jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote,
      organizationVariables: [{ name: resource.name, value }] });
    jest.mocked(f.read.sharedMetadata).mockResolvedValue([resource]);
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(true); expect(plan.grants).toEqual([]);
    jest.mocked(f.read.sharedMetadata).mockResolvedValue([{ ...resource, value: value + ' ' }]);
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    jest.mocked(f.read.sharedMetadata).mockResolvedValue([{ ...resource, value: undefined }]);
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    jest.mocked(f.read.sharedMetadata).mockResolvedValue([resource]);
    effective.mockResolvedValue({ ...f.plan.remote, organizationVariables: [] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    expect(f.variableWriter.createMissing).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled();
  });
  it('reuses the exact complete prepared branch without posting another ref', async () => {
    const f = fixture(); f.setBranch(prepared);
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).resolves.toBeUndefined();
    expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  });
  it('revalidates an existing effective shared Variable and skips a redundant development-branch lookup', async () => {
    const f = fixture(); const resource = { kind: 'variable' as const, name: 'BUGBOT_COMMENT_LIMIT', value: '19', visibility: 'all' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [] };
    const plan = { ...f.plan, configuration: { ...f.plan.configuration, repository: { ...f.plan.configuration.repository, developmentBranch: 'master' } }, sharedSnapshot: [resource] };
    jest.mocked(f.read.sharedMetadata).mockResolvedValue([resource]);
    const effective = jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote, organizationVariables: [{ name: resource.name, value: resource.value }] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(true); expect(f.read.branchExists).not.toHaveBeenCalled();
    effective.mockResolvedValue({ ...f.plan.remote, organizationVariables: [] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    const grant = { kind: 'variable' as const, name: resource.name, repositoryId: 7 };
    expect(await f.writer.revalidate({ ...plan, grants: [grant] }, 'fixture', [])).toBe(true);
    expect(await f.writer.revalidate({ ...plan, grants: [grant] }, 'fixture', ['access'])).toBe(false);
  });
  it('adds only the reviewed Variable membership using the variable access endpoint', async () => {
    const f = fixture(); const resource = { kind: 'variable' as const, name: 'BUGBOT_COMMENT_LIMIT', value: '19', visibility: 'selected' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1] };
    const grant = { kind: 'variable' as const, name: resource.name, repositoryId: 7 };
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce({ ...resource, selectedRepositoryIds: [1, 7] });
    f.request.mockResolvedValue({ data: {} });
    await f.writer.grant({ ...f.plan, sharedSnapshot: [resource], grants: [grant] }, grant, 'fixture');
    expect(f.request).toHaveBeenCalledWith('PUT /orgs/{org}/actions/variables/{name}/repositories/{repository_id}', expect.objectContaining({ name: resource.name, repository_id: 7 }));
  });
  it('preserves an original grant error when readback cannot prove retained access', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 };
    f.shared.mockResolvedValue(resource); f.request.mockRejectedValue(new SetupBatchProviderError('forbidden'));
    await expect(f.writer.grant({ ...f.plan, sharedSnapshot: [resource], grants: [grant] }, grant, 'fixture')).rejects.toThrow('forbidden');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('rejects a reviewed grant without its reviewed resource snapshot before mutation', async () => {
    const f = fixture(); const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 };
    f.shared.mockResolvedValue({ kind: 'secret', name: 'PAT', visibility: 'selected', updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [] });
    await expect(f.writer.grant({ ...f.plan, grants: [grant] }, grant, 'fixture')).rejects.toThrow('unknown'); expect(f.request).not.toHaveBeenCalled();
  });
  it('does not recreate a repository Variable removed after review', async () => {
    const f = fixture(); const variable = { name: 'MODEL', value: 'reviewed' };
    await expect(f.writer.variables({ ...f.plan, repositoryVariables: [variable], remote: { ...f.plan.remote, repositoryVariables: [variable] } }, 'fixture')).rejects.toThrow('unknown');
    expect(f.variableWriter.createMissing).not.toHaveBeenCalled();
  });
  it('blocks preparation immediately when the reviewed repository moved', async () => {
    const f = fixture(); jest.mocked(f.read.resolve).mockResolvedValue({ ...f.plan.target, baseSha: 'f'.repeat(40) });
    await expect(f.writer.prepareCommit(f.plan, operation, 'fixture')).rejects.toThrow('unknown'); expect(f.request).not.toHaveBeenCalled();
  });
  it.each([true, false])('keeps a reviewed existing manifest and explicit file deletion: draft manifest=%s', async inDraft => {
    const f = fixture(); const manifest = { path: '.copilot/setup-manifest.json', content: JSON.stringify({ schemaVersion: 2, custom: 'retained' }) };
    jest.mocked(f.read.files).mockResolvedValue([manifest]);
    const plan = { ...f.plan, files: [...f.plan.files, { path: '.github/workflows/obsolete.yml', content: null }, ...(inDraft ? [manifest] : [])] };
    await f.writer.prepareCommit(plan, operation, 'fixture');
    const tree = f.request.mock.calls.find(([route]) => route === 'POST /repos/{owner}/{repo}/git/trees')![1].tree;
    expect(tree).toEqual(expect.arrayContaining([{ path: '.github/workflows/obsolete.yml', type: 'blob', mode: '100644', sha: null },
      expect.objectContaining({ path: manifest.path, content: expect.stringContaining('retained') })]));
    expect(f.read.files).toHaveBeenCalledTimes(inDraft ? 0 : 1);
  });
  it('refuses a non-object manifest or invalid operation receipt before any Git write', async () => {
    const f = fixture();
    await expect(f.writer.prepareCommit({ ...f.plan, files: [{ path: '.copilot/setup-manifest.json', content: 'null' }] }, operation, 'fixture')).rejects.toThrow('malformed');
    await expect(f.writer.prepareCommit(f.plan, 'invalid-operation', 'fixture')).rejects.toThrow('malformed');
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it('does not write a ref when the existing Git ref is malformed or unreadable', async () => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route.includes('git/ref/') ? Promise.resolve({ data: { object: { sha: 'HEAD' } } }) : original(route, parameters));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow('malformed');
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it('requires the exact prepared ref before even inspecting installation PRs', async () => {
    const f = fixture(); f.setBranch('f'.repeat(40));
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow('unknown');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('ignores unrelated PRs and old closed operations while keeping the exact existing PR', async () => {
    const f = fixture(); f.setBranch(prepared); f.setPulls([{ head: { ref: 'feature/unrelated' } },
      { state: 'closed', head: { ref: 'setup/copilot/old-operation' } }, f.pull()]);
    expect(await f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).toBe(31);
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it.each([{}, Array.from({ length: 101 }, () => ({})), undefined])('rejects malformed or ambiguous PR inventories before creation', async data => {
    const f = fixture(); f.setBranch(prepared); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route === 'GET /repos/{owner}/{repo}/pulls' ? Promise.resolve({ data: data ?? [f.pull(), f.pull()] }) : original(route, parameters));
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it('pauses after the fixed PR discovery cap instead of creating against an incomplete inventory', async () => {
    const f = fixture(); f.setBranch(prepared); f.setPulls(Array.from({ length: 100 }, () => ({ head: { ref: 'feature/other' } })));
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow('malformed');
    expect(f.request.mock.calls.filter(([route]) => route === 'GET /repos/{owner}/{repo}/pulls')).toHaveLength(10);
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it('never sends an existing reviewed Variable to a replacement writer', async () => {
    const f = fixture(); const variable = { name: 'MODEL', value: 'original' };
    const plan = { ...f.plan, remote: { ...f.plan.remote, repositoryVariables: [variable] }, repositoryVariables: [{ name: 'MODEL', value: 'desired' }] };
    jest.spyOn(f.read, 'effective').mockResolvedValue(plan.remote);
    await expect(f.writer.variables(plan, 'fixture')).rejects.toThrow('unknown');
    expect(f.variableWriter.createMissing).not.toHaveBeenCalled(); expect(f.variableWriter.upsert).not.toHaveBeenCalled();
  });
  it('prepares a complete tree on the exact base and embeds a secret-free receipt before creating a ref', async () => {
    const f = fixture(); expect(await f.writer.prepareCommit(f.plan, operation, 'fixture-token')).toBe(prepared);
    const tree = f.request.mock.calls.find(([route]) => route === 'POST /repos/{owner}/{repo}/git/trees')![1];
    expect(tree.base_tree).toBe(f.baseTree.root);
    expect(tree.tree).toEqual(expect.arrayContaining([expect.objectContaining({ path: '.copilot/setup-manifest.json', content: expect.stringContaining('installation') })]));
    expect(JSON.stringify(tree)).not.toContain('fixture-token');
    expect(f.request).toHaveBeenCalledWith('POST /repos/{owner}/{repo}/git/commits', expect.objectContaining({ parents: [base] }));
    expect(f.request.mock.calls.some(([route]) => route.includes('git/refs'))).toBe(false);
  });
  it('adopts only the exact complete prepared commit after an uncertain ref create', async () => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, parameters) => { const result = await original(route, parameters);
      if (route === 'POST /repos/{owner}/{repo}/git/refs') throw new Error('lost response'); return result; });
    await f.writer.branch(f.plan, operation, prepared, 'fixture');
    expect(f.request.mock.calls.filter(([route]) => route === 'POST /repos/{owner}/{repo}/git/refs')).toHaveLength(1);
  });
  it('never overwrites a human-moved installation ref', async () => {
    const f = fixture(); f.setBranch('f'.repeat(40));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request.mock.calls.some(([route]) => !route.startsWith('GET '))).toBe(false);
  });
  it.each([{ schemaVersion: 2 }, { schemaVersion: 1, operationId: operation, repositoryId: 8, baseSha: base, planDigest: 'b'.repeat(64) }])('rejects a forged or future installation receipt %j', async receipt => {
    const f = fixture(); f.setReceipt(receipt);
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/contents/{path}',
      expect.objectContaining({ path: '.copilot/setup-manifest.json', ref: prepared }));
    expect(f.request.mock.calls.some(([route]) => !route.startsWith('GET '))).toBe(false);
  });
  it('inspects an uncertain PR response and reuses its exact marker without another creation', async () => {
    const f = fixture(); f.setBranch(prepared); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, parameters) => { const result = await original(route, parameters);
      if (route === 'POST /repos/{owner}/{repo}/pulls') throw new Error('lost response'); return result; });
    expect(await f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).toBe(31);
    expect(await f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).toBe(31);
    expect(f.request.mock.calls.filter(([route]) => route === 'POST /repos/{owner}/{repo}/pulls')).toHaveLength(1);
  });
  it('does not resurrect a manually closed setup PR', async () => {
    const f = fixture(); f.setBranch(prepared); f.setPulls([{ ...f.pull(), state: 'closed' }]);
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request.mock.calls.some(([route]) => !route.startsWith('GET '))).toBe(false);
  });
  it('surfaces another open installer PR instead of creating a duplicate operation', async () => {
    const f = fixture(); f.setBranch(prepared); f.setPulls([{ ...f.pull(), head: { ...f.pull().head,
      ref: 'setup/copilot/another-operation' } }]);
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request.mock.calls.some(([route]) => !route.startsWith('GET '))).toBe(false);
  });
  it('writes only reviewed repository Variable differences and never a shared value', async () => {
    const f = fixture(); const plan = { ...f.plan, repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '19' }] };
    await f.writer.variables(plan, 'fixture');
    expect(f.variableWriter.createMissing).toHaveBeenCalledWith('acme', 'repo', 'fixture', plan.repositoryVariables);
    expect(f.variableWriter.upsertScopedVariables).not.toHaveBeenCalled();
  });
  it('preserves a concurrent repository Variable edit', async () => {
    const f = fixture(); jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote,
      repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: 'other' }] });
    await expect(f.writer.variables({ ...f.plan, repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '19' }] }, 'fixture')).rejects.toThrow();
    expect(f.variableWriter.upsert).not.toHaveBeenCalled();
  });
  it('adds one reviewed repository to a selected Secret and retains other memberships', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1, 2] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 };
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce({ ...resource, selectedRepositoryIds: [1, 2, 7, 9] });
    f.request.mockResolvedValueOnce({ data: {} });
    await f.writer.grant({ ...f.plan, grants: [grant], sharedSnapshot: [resource] }, grant, 'fixture');
    expect(f.request).toHaveBeenCalledWith('PUT /orgs/{org}/actions/secrets/{name}/repositories/{repository_id}',
      expect.objectContaining({ org: 'acme', name: 'PAT', repository_id: 7 }));
    expect(f.request.mock.calls).toHaveLength(1);
  });
  it('rejects an unreviewed grant before any provider call', async () => {
    const f = fixture();
    await expect(f.writer.grant(f.plan, { kind: 'secret', name: 'PAT', repositoryId: 8 }, 'fixture')).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
  });
  it.each(['repositoryVariablesAccess', 'repositorySecretsAccess', 'organizationVariablesAccess', 'organizationSecretsAccess'] as const)('blocks unavailable %s before any effect', async field => {
    const f = fixture(); jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote, [field]: 'unavailable' });
    expect(await f.writer.revalidate(f.plan, 'fixture', [])).toBe(false); expect(f.request).not.toHaveBeenCalled();
  });
  it('blocks deletion or inaccessible development branch before setup writes', async () => {
    const f = fixture(); jest.mocked(f.read.branchExists).mockResolvedValue(false);
    expect(await f.writer.revalidate(f.plan, 'fixture', [])).toBe(false); expect(f.request).not.toHaveBeenCalled();
  });
  it('blocks changed repository identity and missing or rotated shared bindings', async () => {
    const f = fixture(); const resolve = jest.mocked(f.read.resolve); resolve.mockResolvedValueOnce({ ...f.plan.target, id: 8 });
    expect(await f.writer.revalidate(f.plan, 'fixture', [])).toBe(false);
    const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'all' as const, updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [] };
    const plan = { ...f.plan, sharedSnapshot: [resource] }; const metadata = jest.mocked(f.read.sharedMetadata);
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    metadata.mockResolvedValueOnce([{ ...resource, updatedAt: '2026-10-17T14:01:00Z' }]);
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    metadata.mockResolvedValueOnce([resource]); jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote, organizationSecrets: [] });
    expect(await f.writer.revalidate(plan, 'fixture', ['access'])).toBe(false);
  });
  it('accepts reviewed Variable results but stops a concurrent Secret or Variable change', async () => {
    const f = fixture(); const effective = jest.spyOn(f.read, 'effective');
    const plan = { ...f.plan, repositoryVariables: [{ name: 'MODEL', value: 'reviewed' }] };
    effective.mockResolvedValueOnce({ ...f.plan.remote, repositoryVariables: plan.repositoryVariables });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(true);
    effective.mockResolvedValueOnce({ ...f.plan.remote, repositoryVariables: [{ name: 'MODEL', value: 'human' }] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    effective.mockResolvedValueOnce({ ...f.plan.remote, repositorySecrets: ['PAT'] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    expect(await f.writer.revalidate({ ...f.plan, remote: { ...f.plan.remote, repositoryVariables: [{ name: 'MODEL', value: 'original' }] } }, 'fixture', [])).toBe(false);
  });
  it('blocks a same-name repository Secret rotation before any setup effect', async () => {
    const f = fixture(); const original = { name: 'PAT', updatedAt: '2026-10-17T14:00:00Z' };
    const plan = { ...f.plan, remote: { ...f.plan.remote, repositorySecrets: ['PAT'], repositorySecretRevisions: [original] } };
    jest.spyOn(f.read, 'effective').mockResolvedValue({ ...plan.remote, repositorySecretRevisions: [{ ...original, updatedAt: '2026-10-17T14:01:00Z' }] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false); expect(f.request).not.toHaveBeenCalled();
  });
  it.each([undefined, [], [{ name: 'OTHER', updatedAt: '2026-10-17T14:00:00Z' }],
    [{ name: 'PAT', updatedAt: 'unknown' }]])('blocks missing or incomplete repository Secret revisions %j', async revisions => {
    const f = fixture(); const remote = { ...f.plan.remote, repositorySecrets: ['PAT'], repositorySecretRevisions: revisions };
    jest.spyOn(f.read, 'effective').mockResolvedValue(remote);
    expect(await f.writer.revalidate({ ...f.plan, remote }, 'fixture', [])).toBe(false); expect(f.request).not.toHaveBeenCalled();
  });
  it('requires complete reviewed and fresh revisions and ignores harmless ordering', async () => {
    const f = fixture(); const revisions = [{ name: 'PAT', updatedAt: '2026-10-17T14:00:00Z' },
      { name: 'OTHER', updatedAt: '2026-10-17T14:01:00Z' }];
    const remote = { ...f.plan.remote, repositorySecrets: ['PAT', 'OTHER'], repositorySecretRevisions: revisions };
    const effective = jest.spyOn(f.read, 'effective').mockResolvedValue({ ...remote,
      repositorySecrets: [...remote.repositorySecrets].reverse(), repositorySecretRevisions: [...revisions].reverse() });
    expect(await f.writer.revalidate({ ...f.plan, remote }, 'fixture', [])).toBe(true);
    expect(await f.writer.revalidate({ ...f.plan, remote: { ...remote, repositorySecretRevisions: undefined } }, 'fixture', [])).toBe(false);
    effective.mockResolvedValue({ ...remote, repositorySecretRevisions: undefined });
    expect(await f.writer.revalidate({ ...f.plan, remote }, 'fixture', [])).toBe(false);
  });
  it('skips an already written Variable and refuses unavailable or failed writes', async () => {
    const f = fixture(); const variable = { name: 'MODEL', value: 'reviewed' }; const plan = { ...f.plan, repositoryVariables: [variable] };
    const effective = jest.spyOn(f.read, 'effective'); effective.mockResolvedValueOnce({ ...f.plan.remote, repositoryVariables: [variable] });
    await f.writer.variables(plan, 'fixture'); expect(f.variableWriter.upsert).not.toHaveBeenCalled();
    effective.mockResolvedValueOnce({ ...f.plan.remote, repositoryVariablesAccess: 'unavailable' });
    await expect(f.writer.variables(plan, 'fixture')).rejects.toThrow('forbidden');
    effective.mockResolvedValue(f.plan.remote); f.variableWriter.createMissing.mockResolvedValue({ created: 0, updated: 0, errors: ['private'] });
    await expect(f.writer.variables(plan, 'fixture')).rejects.toThrow('unknown');
  });
  it('retains already granted access without an additional PUT', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const, updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1, 7] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 }; f.shared.mockResolvedValue(resource);
    await f.writer.grant({ ...f.plan, grants: [grant], sharedSnapshot: [resource] }, grant, 'fixture'); expect(f.request).not.toHaveBeenCalled();
  });
  it('does not remove another repository membership or accept changed visibility during a grant', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const, updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1, 2] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 }; const plan = { ...f.plan, grants: [grant], sharedSnapshot: [resource] };
    f.shared.mockResolvedValueOnce({ ...resource, visibility: 'all' });
    await expect(f.writer.grant(plan, grant, 'fixture')).rejects.toThrow(); expect(f.request).not.toHaveBeenCalled();
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce({ ...resource, selectedRepositoryIds: [7] }); f.request.mockResolvedValue({ data: {} });
    await expect(f.writer.grant(plan, grant, 'fixture')).rejects.toThrow('unknown');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('inspects an uncertain additive grant and accepts only effective retained access', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const, updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 }; const plan = { ...f.plan, grants: [grant], sharedSnapshot: [resource] };
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce({ ...resource, selectedRepositoryIds: [1, 7], updatedAt: '2026-10-17T14:01:00Z' });
    f.request.mockRejectedValue(new Error('response lost')); await f.writer.grant(plan, grant, 'fixture'); expect(f.request).toHaveBeenCalledTimes(1);
    jest.mocked(f.read.sharedMetadata).mockResolvedValue([{ ...resource, updatedAt: '2026-10-17T14:01:00Z' }]);
    expect(await f.writer.revalidate(plan, 'fixture', ['access'])).toBe(true);
  });
  it('resumes a completed grant with a new adapter and freshly reviewed metadata, while rejecting stale plans and later rotations', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 };
    const originalPlan = { ...f.plan, grants: [grant], sharedSnapshot: [resource] };
    const observed = { ...resource, updatedAt: '2026-10-17T14:01:00Z', selectedRepositoryIds: [1, 7] };
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce(observed);
    f.request.mockResolvedValue({ data: {} });
    await f.writer.grant(originalPlan, grant, 'fixture');
    const restarted = new SetupBatchGithubApplyAdapter(f.read, f.variableWriter, f.resources);
    const metadata = jest.mocked(f.read.sharedMetadata).mockResolvedValue([observed]);
    expect(await restarted.revalidate(originalPlan, 'fixture', ['access'])).toBe(false);
    const freshPlan = { ...originalPlan, grants: [], sharedSnapshot: [observed] };
    expect(await restarted.revalidate(freshPlan, 'fixture', ['access'])).toBe(true);
    metadata.mockResolvedValue([{ ...observed, updatedAt: '2026-10-17T14:02:00Z' }]);
    expect(await restarted.revalidate(freshPlan, 'fixture', ['access'])).toBe(false);
    expect(f.request.mock.calls.filter(([route]) => route.startsWith('PUT '))).toHaveLength(1);
  });
  it.each([{ route: 'POST /repos/{owner}/{repo}/git/trees', data: { sha: 'HEAD' } },
    { route: 'POST /repos/{owner}/{repo}/git/commits', data: { sha: 'HEAD' } },
    { route: 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}', data: { tree: {} } }])('rejects malformed Git object identities at $route', async ({ route: failed, data }) => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route === failed ? Promise.resolve({ data }) : original(route, parameters));
    await expect(f.writer.prepareCommit(f.plan, operation, 'fixture')).rejects.toThrow('malformed');
    expect(f.request.mock.calls.some(([route]) => route.includes('git/refs'))).toBe(false);
  });
  it('refuses incomplete parents, malformed manifest encoding and invalid prepared commits', async () => {
    const f = fixture(); await expect(f.writer.branch(f.plan, operation, 'HEAD', 'fixture')).rejects.toThrow('malformed');
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route.includes('git/commits') ? Promise.resolve({ data: { parents: [] } }) : original(route, parameters));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow('unknown');
    f.request.mockImplementation((route, parameters) => route.includes('/contents/') ? Promise.resolve({ data: { encoding: 'raw', content: '{}' } }) : original(route, parameters));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow('malformed');
  });
  it('refuses to claim an unconfirmed branch or PR creation as success', async () => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route.startsWith('POST ') ? Promise.resolve({ data: {} }) : original(route, parameters));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow('unknown');
    f.setBranch(prepared); await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow('unknown');
    expect(f.request.mock.calls.filter(([route]) => route === 'POST /repos/{owner}/{repo}/pulls')).toHaveLength(1);
  });

});

test('real namespace parsing includes the selected runner registry for Apply freshness without granting registry access', async () => {
  const f = fixture();
  const profile = { id: 'shared', group: 'vypdev', labels: ['self-hosted', 'Linux'], validation: 'hosted' as const };
  const value = JSON.stringify({ schemaVersion: 1, profiles: [profile] });
  const configuration = { ...f.plan.configuration, runners: { mode: 'organization-profile' as const,
    profileId: profile.id, group: profile.group, labels: profile.labels, validation: profile.validation,
    source: { scope: 'organization' as const, value } } };
  jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote, organizationVariables: [{ name: 'COPILOT_RUNNER_PROFILES', value }] });
  jest.mocked(f.read.sharedMetadata).mockRestore();
  f.request.mockImplementation(async route => {
    if (route === 'GET /orgs/{org}/actions/variables') return { data: { total_count: 2, variables: [
      { name: 'COPILOT_RUNNER_PROFILES', value, visibility: 'selected', updated_at: '2026-10-18T00:00:00Z' },
      { name: 'UNMANAGED_SETTING', value: 'leave alone', visibility: 'all', updated_at: '2026-10-18T00:00:00Z' },
    ] } };
    if (route === 'GET /orgs/{org}/actions/secrets') return { data: { total_count: 0, secrets: [] } };
    throw new Error('Unexpected provider write or access grant');
  });
  expect(await f.read.sharedMetadata('acme', 'fixture')).toEqual([expect.objectContaining({ name: 'COPILOT_RUNNER_PROFILES', value })]);
  expect(await f.writer.revalidate({ ...f.plan, configuration }, 'fixture', [])).toBe(true);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  expect(f.variableWriter.createMissing).not.toHaveBeenCalled(); expect(f.resources.labels).not.toHaveBeenCalled();
});


describe('publisher977-C124 durable resource checkpoint before delivery', () => {
  it.each(['before-save', 'after-save'] as const)('publisher977-C124 resumes after the final resource journal failure at %s without repeating effects', async boundary => {
    const f = await recoveryFixture();
    try {
      const save = f.journal.save.bind(f.journal); let failed = false;
      jest.spyOn(f.journal, 'save').mockImplementation(async state => {
        const target = state.targets[0];
        if (!failed && target.status === 'applying' && target.effects.length === 4 && target.reason === undefined) {
          failed = true;
          if (boundary === 'after-save') await save(state);
          throw new Error('controlled final resource checkpoint failure');
        }
        await save(state);
      });
      const first = await f.execute();
      expect(failed).toBe(true); expect(first.targets[0]).toMatchObject({ status: 'partial', effects: ['access', 'variables', 'labels', 'issue-types'] });
      expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
      expect(await f.receipt()).toEqual(JSON.parse(JSON.stringify(first)));
      const second = await f.execute();
      console.info('ROUND22_RESOURCE_SAVE_OBSERVATION', JSON.stringify({ boundary, first: first.targets[0], second: second.targets[0],
        posts: f.request.mock.calls.filter(([route]) => route.startsWith('POST ')).map(([route]) => route), reviews: f.review.mock.calls.length }));
      expect(second.targets[0]).toMatchObject({ status: 'waiting-for-merge', preparedCommit: prepared, pullRequestNumber: 31 });
      expect(first.targets[0].reason).toBe('preflight'); expect(f.review).toHaveBeenCalledTimes(2);
      expect(f.resources.labels).toHaveBeenCalledTimes(1); expect(f.resources.issueTypes).toHaveBeenCalledTimes(1);
      expect(f.variableWriter.createMissing).not.toHaveBeenCalled();
      for (const route of ['git/trees', 'git/commits', 'git/refs', 'pulls']) expect(f.posts(route)).toHaveLength(1);
      expect(await f.receipt()).toEqual(JSON.parse(JSON.stringify(second)));
    } finally { await f.cleanup(); }
  });
  it('publisher977-C124 preserves unknown legacy preparation across a new pre-delivery read failure', async () => {
    let failed = false;
    const f = await recoveryFixture({ writer: writer => {
      if (!failed) jest.spyOn(writer, 'revalidate').mockImplementationOnce(async () => { failed = true; throw new Error('controlled read failure'); });
    } });
    try {
      const initial = beginSetupBatchOperation({ operationId: operation, organization: 'acme', targets: [f.plan] });
      await f.journal.save({ ...initial, targets: [{ ...initial.targets[0], status: 'partial', reason: 'provider',
        effects: ['access', 'variables', 'labels', 'issue-types'] }] });
      const first = await f.execute(); expect(first.targets[0]).toMatchObject({ status: 'partial', reason: 'provider' });
      const second = await f.execute(); expect(second.targets[0]).toMatchObject({ status: 'partial', reason: 'provider' });
      expect(f.review).toHaveBeenCalledTimes(2); expect(failed).toBe(true);
      expect(f.resources.labels).not.toHaveBeenCalled(); expect(f.resources.issueTypes).not.toHaveBeenCalled();
      expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
      expect(await f.receipt()).toEqual(JSON.parse(JSON.stringify(second)));
    } finally { await f.cleanup(); }
  });
});
