import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupBatchWorkspaceAdapter } from '../setup_batch_workspace_adapter';
import { SetupBatchJournalAdapter } from '../setup_batch_journal_adapter';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import * as setupFiles from '../../utils/setup_files';
import type { SetupBatchOperation } from '../../domain/setup_batch';
import type { Dirent } from 'node:fs';
import { load } from 'js-yaml';
const id = 'a67c8e40-93be-43ed-a7ed-e07378c7e773';
const operation: SetupBatchOperation = { schemaVersion: 1, operationId: id, organization: 'acme', targets: [{ repositoryId: 7,
  repository: 'repo', defaultBranch: 'master', baseSha: 'a'.repeat(40), planDigest: 'b'.repeat(64), status: 'ready', effects: [] }] };
describe('isolated setup rendering and private durable receipts', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'copilot-batch-test-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  it('rejects a journal root that ceases to be a directory before opening any receipt', async () => {
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const info = await fs.lstat(root, { bigint: true });
    const stat = jest.spyOn(fs, 'lstat').mockResolvedValueOnce(Object.assign(info, { isDirectory: () => false }));
    try {
      await expect(new SetupBatchJournalAdapter(root).save(operation)).rejects.toThrow('directory must be private');
      expect(jest.requireActual<typeof import('node:fs')>('node:fs').readdirSync(root)).toEqual([]);
    } finally { stat.mockRestore(); }
  });
  it('removes an uncommitted temporary receipt after an atomic rename failure and retains the old receipt', async () => {
    const journal = new SetupBatchJournalAdapter(root); await journal.save(operation);
    const filesystem = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const rename = jest.spyOn(filesystem, 'rename').mockRejectedValueOnce(new Error('fixture rename failure'));
    try {
      await expect(journal.save({ ...operation, targets: [{ ...operation.targets[0], status: 'partial' }] })).rejects.toThrow('rename failure');
      expect(await journal.load(id)).toEqual(operation);
      expect(jest.requireActual<typeof import('node:fs')>('node:fs').readdirSync(root)).toEqual([`${id}.json`]);
    } finally { rename.mockRestore(); }
  });
  it('retains the previous receipt and the original failure if temporary-file cleanup also fails', async () => {
    const journal = new SetupBatchJournalAdapter(root); await journal.save(operation);
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const failure = new Error('fixture atomic rename failure');
    const rename = jest.spyOn(fs, 'rename').mockRejectedValueOnce(failure);
    const unlink = jest.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('fixture cleanup denied'));
    try {
      await expect(journal.save({ ...operation, targets: [{ ...operation.targets[0], status: 'partial' }] })).rejects.toBe(failure);
      expect(await journal.load(id)).toEqual(operation);
    } finally { rename.mockRestore(); unlink.mockRestore(); }
  });
  it('preserves non-collision lock failures without claiming an orphan or creating a receipt', async () => {
    const filesystem = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const failure = Object.assign(new Error('fixture access failure'), { code: 'EACCES' });
    const open = jest.spyOn(filesystem, 'open').mockRejectedValueOnce(failure);
    try {
      await expect(new SetupBatchJournalAdapter(root).lock(id)).rejects.toBe(failure);
      expect(jest.requireActual<typeof import('node:fs')>('node:fs').readdirSync(root)).toEqual([]);
    } finally { open.mockRestore(); }
  });
  it('uses a private journal under the configured home rather than the caller checkout', async () => {
    const os = jest.requireActual<typeof import('node:os')>('node:os');
    const home = jest.spyOn(os, 'homedir').mockReturnValue(root);
    try {
      const journal = new SetupBatchJournalAdapter(); await journal.save(operation);
      expect(await journal.load(id)).toEqual(operation);
      expect(readFileSync(join(root, '.copilot/setup-operations', `${id}.json`), 'utf8')).not.toContain('token');
    } finally { home.mockRestore(); }
  });
  it('does not remove a damaged or foreign-process replacement lock', async () => {
    const journal = new SetupBatchJournalAdapter(root); const release = await journal.lock(id);
    const lock = join(root, `${id}.json.lock`);
    writeFileSync(lock, '{damaged'); await release(); expect(readFileSync(lock, 'utf8')).toBe('{damaged');
    writeFileSync(lock, JSON.stringify({ pid: process.pid + 1, nonce: 'foreign' }));
    await release(); expect(JSON.parse(readFileSync(lock, 'utf8')).pid).toBe(process.pid + 1);
  });
  it('generates independent valid operation identities', () => {
    const renderer = new SetupBatchWorkspaceAdapter(); const first = renderer.operationId();
    expect(first).toMatch(/^[a-f0-9-]{36}$/u); expect(renderer.operationId()).not.toBe(first);
  });
  it('rejects an unexpected generated file before returning a partial diff', async () => {
    const copy = jest.spyOn(setupFiles, 'copySetupFiles').mockImplementation(directory => {
      writeFileSync(join(directory, 'unexpected.ts'), 'not an installation asset'); return { copied: 1, skipped: 0 };
    });
    try { await expect(new SetupBatchWorkspaceAdapter().render(createDefaultSetupConfiguration(), [])).rejects.toThrow('unexpected setup asset'); }
    finally { copy.mockRestore(); }
  });
  it('rejects non-regular generated entries without traversing or following them', async () => {
    const filesystem = jest.requireActual<typeof import('node:fs')>('node:fs');
    const list = jest.spyOn(filesystem, 'readdirSync');
    const copy = jest.spyOn(setupFiles, 'copySetupFiles').mockImplementation(() => {
      // The renderer requests UTF-8 Dirents; Jest infers Node's final Buffer overload.
      const entries = [{ name: 'link', isDirectory: () => false, isFile: () => false } as Dirent] as unknown as ReturnType<typeof filesystem.readdirSync>;
      list.mockReturnValueOnce(entries);
      return { copied: 0, skipped: 0 };
    });
    try { await expect(new SetupBatchWorkspaceAdapter().render(createDefaultSetupConfiguration(), [])).rejects.toThrow('regular files'); }
    finally { list.mockRestore(); copy.mockRestore(); }
  });
  it('represents an intentionally removed generated asset as a reviewed tombstone', async () => {
    const copy = jest.spyOn(setupFiles, 'copySetupFiles').mockImplementation(directory => {
      rmSync(join(directory, 'AGENTS.md')); return { copied: 0, skipped: 0 };
    });
    try {
      expect(await new SetupBatchWorkspaceAdapter().render(createDefaultSetupConfiguration(), [{ path: 'AGENTS.md', content: 'previous' }]))
        .toEqual([{ path: 'AGENTS.md', content: null }]);
    } finally { copy.mockRestore(); }
  });
  it.each(['duplicates', 'count', 'cumulative bytes'])('blocks invalid asset inventory: %s', async kind => {
    const files = kind === 'duplicates' ? [{ path: 'AGENTS.md', content: 'a' }, { path: 'AGENTS.md', content: 'b' }]
      : Array.from({ length: kind === 'count' ? 301 : 21 }, (_, i) => ({ path: `.github/workflows/job-${i}.yml`, content: kind === 'count' ? '' : 'x'.repeat(100_000) }));
    await expect(new SetupBatchWorkspaceAdapter().render(createDefaultSetupConfiguration(), files)).rejects.toThrow('budget');
  });
  it('persists only validated metadata and rejects future schemas or injected values', async () => {
    const journal = new SetupBatchJournalAdapter(root);
    expect(await journal.load(id)).toBeUndefined();
    await journal.save(operation); expect(await journal.load(id)).toEqual(operation);
    expect(readFileSync(join(root, `${id}.json`), 'utf8')).not.toContain('configuration');
    await expect(journal.save({ ...operation, token: 'fixture' } as SetupBatchOperation)).rejects.toThrow();
    writeFileSync(join(root, `${id}.json`), JSON.stringify({ ...operation, schemaVersion: 2 }));
    await expect(journal.load(id)).rejects.toThrow('unsupported');
  });
  it('allows one Apply owner and releases its lock before returning', async () => {
    const journal = new SetupBatchJournalAdapter(root); const release = await journal.lock(id);
    await expect(journal.lock(id)).rejects.toMatchObject({ code: 'EEXIST' });
    await release(); const next = await journal.lock(id); await next();
  });
  it('does not delete a replaced lock that belongs to another owner', async () => {
    const journal = new SetupBatchJournalAdapter(root); const release = await journal.lock(id);
    writeFileSync(join(root, `${id}.json.lock`), JSON.stringify({ pid: process.pid, nonce: 'different-owner' }));
    await release(); await expect(journal.lock(id)).rejects.toMatchObject({ code: 'EEXIST' });
  });
  it('explains exact orphan-lock recovery without reclaiming an unknown owner', async () => {
    const journal = new SetupBatchJournalAdapter(root);
    const lockPath = join(root, `${id}.json.lock`);
    const content = JSON.stringify({ pid: 2147483647, nonce: 'retained-owner' });
    writeFileSync(lockPath, content);
    await expect(journal.lock(id)).rejects.toThrow(lockPath);
    await expect(journal.lock(id)).rejects.toThrow('recover-an-orphaned-batch-operation-lock');
    expect(readFileSync(lockPath, 'utf8')).toBe(content);
    rmSync(lockPath); const release = await journal.lock(id); await release();
  });
  it('rejects path traversal and oversized receipts before reading or writing', async () => {
    const journal = new SetupBatchJournalAdapter(root);
    await expect(journal.load('../other')).rejects.toThrow('identity');
    writeFileSync(join(root, `${id}.json`), 'x'.repeat(40_001));
    await expect(journal.load(id)).rejects.toThrow('journal file');
  });
  it('renders real package assets and valid guidance without changing a caller checkout', async () => {
    const renderer = new SetupBatchWorkspaceAdapter(); const configuration = createDefaultSetupConfiguration();
    const result = await renderer.render(configuration, [{ path: 'AGENTS.md', content: '# Human instructions\n' }]);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '.copilot/AGENT_GUIDE.md', content: expect.stringContaining('setup/copilot/<operation-id>') }),
      expect.objectContaining({ path: '.copilot/repository-profile.json', content: expect.stringContaining('installation') }),
      expect.objectContaining({ path: 'AGENTS.md', content: expect.stringContaining('# Human instructions') }),
    ]));
    expect(result.every(file => !file.path.startsWith('/') && !file.path.includes('..'))).toBe(true);
  });
  it('preserves the exact reviewed source Action approval observer when configuring this source repository', async () => {
    const renderer = new SetupBatchWorkspaceAdapter(); const configuration = createDefaultSetupConfiguration();
    const content = readFileSync(join(__dirname, '..', '..', '..', 'setup', 'source-workflows', 'copilot_pull_request_approval.yml'), 'utf8');
    const result = await renderer.render(configuration, [{ path: '.github/workflows/copilot_pull_request_approval.yml', content }]);
    expect(result.some(file => file.path === '.github/workflows/copilot_pull_request_approval.yml')).toBe(false);
  });
  it('keeps an exact source approval observer even if the workflow comparator proposes replacing it', async () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    const content = readFileSync(join(__dirname, '../../../setup/source-workflows/copilot_pull_request_approval.yml'), 'utf8');
    const compare = jest.spyOn(setupFiles, 'compareSetupWorkflows').mockReturnValue([
      { file: 'copilot_pull_request_approval.yml', destination: '.github/workflows/copilot_pull_request_approval.yml', status: 'changed' },
      { file: 'copilot_issue.yml', destination: '.github/workflows/copilot_issue.yml', status: 'changed' },
    ]);
    try {
      const result = await new SetupBatchWorkspaceAdapter().render(configuration, [
        { path: '.github/workflows/copilot_issue.yml', content: 'name: old consumer\njobs: {}\n' },
        { path: '.github/workflows/copilot_pull_request_approval.yml', content },
      ]);
      expect(result.some(file => file.path === '.github/workflows/copilot_pull_request_approval.yml')).toBe(false);
      expect(result.some(file => file.path === '.github/workflows/copilot_issue.yml')).toBe(false);
    } finally { compare.mockRestore(); }
  });
  it('has no file effects when the target already matches the renderer', async () => {
    const renderer = new SetupBatchWorkspaceAdapter(); const configuration = createDefaultSetupConfiguration();
    const first = await renderer.render(configuration, []);
    expect(await renderer.render(configuration, first)).toEqual([]);
  });
  it('retains version-owned source guidance and native workflows, including jobs without a root Action step', async () => {
    const renderer = new SetupBatchWorkspaceAdapter(); const configuration = createDefaultSetupConfiguration();
    const native = [{ path: '.github/workflows/copilot_issue.yml', content: 'jobs: {native: {steps: [{uses: "./", with: {single-action: check_branch_sync_action}}]}}\n' },
      { path: '.github/workflows/copilot_branch_sync.yml', content: 'on: {push: {branches: ["**"]}}\njobs: {sync: {steps: [{uses: "./", with: {single-action: check_branch_sync_action}}]}}\n' },
      { path: '.github/workflows/copilot_pull_request_merge_queue.yml', content: 'jobs: {queue: {steps: [{run: "true", shell: bash}]}}\n' }];
    const guidance = ['.copilot/AGENT_GUIDE.md', '.copilot/repository-profile.json', '.copilot/setup-manifest.json',
      '.agents/skills/copilot-repository-workflow/SKILL.md', 'AGENTS.md'].map(path => ({ path, content: `retained canonical source artifact: ${path}\n` }));
    const result = await renderer.render(configuration, [...native, ...guidance]);
    expect(result.filter(file => [...native.filter(item => !item.path.endsWith('copilot_branch_sync.yml')), ...guidance]
      .some(existing => existing.path === file.path))).toEqual([]);
    const observer = result.find(file => file.path.endsWith('/workflows/copilot_branch_sync.yml'));
    const expectedObserver = load(native[1].content) as { on: { push: { branches: string[] } } };
    expectedObserver.on.push.branches.push('!copilot-permission-test-*');
    expect(load(observer!.content!)).toEqual(expectedObserver);
    expect(result.some(file => file.path === '.github/workflows/copilot_pull_request.yml')).toBe(true);
  });
  it.each(['copilot_commit.yml', 'copilot_branch_sync.yml'])('upgrades probe admission in native source %s without changing its jobs or user workflows', async name => {
    const renderer = new SetupBatchWorkspaceAdapter(); const configuration = createDefaultSetupConfiguration();
    const path = `.github/workflows/${name}`;
    const content = readFileSync(join(process.cwd(), path), 'utf8').replace("      - '!copilot-permission-test-*'\n", '');
    const user = { path: '.github/workflows/user-ci.yml', content: 'on: push\njobs: {ci: {runs-on: ubuntu-latest, steps: [{run: "echo user"}]}}\n' };
    const existing = [{ path, content }, user];
    const result = await renderer.render(configuration, existing);
    const updated = result.find(file => file.path === path)?.content;
    expect(updated).toBeDefined();
    const expected = load(content) as { on: { push: { branches: string[] } } };
    expected.on.push.branches.push('!copilot-permission-test-*');
    expect(load(updated!)).toEqual(expected);
    expect(result.some(file => file.path === user.path)).toBe(false);
    expect(result.some(file => file.path.startsWith('.copilot/setup-backups/') && file.content === content)).toBe(true);
    const merged = new Map([...existing, ...result].map(file => [file.path, file]));
    expect(await renderer.render(configuration, [...merged.values()])).toEqual([]);
  });
  it('preserves source push jobs without a root-local action step during the reviewed upgrade', async () => {
    const renderer = new SetupBatchWorkspaceAdapter(); const configuration = createDefaultSetupConfiguration();
    const source = { path: '.github/workflows/copilot_issue.yml', content: 'jobs: {native: {steps: [{uses: "./", with: {single-action: check_branch_sync_action}}]}}\n' };
    const path = '.github/workflows/copilot_branch_sync.yml';
    const content = 'on: {push: {branches: ["**"]}}\njobs: {custom: {runs-on: ubuntu-latest, permissions: {contents: read}, steps: [{run: "echo native", shell: bash}]}}\n';
    const result = await renderer.render(configuration, [source, { path, content }]);
    const expected = load(content) as { on: { push: { branches: string[] } } };
    expected.on.push.branches.push('!copilot-permission-test-*');
    expect(load(result.find(file => file.path === path)!.content!)).toEqual(expected);
  });
  it('generates missing source guidance instead of treating an incomplete source installation as canonical', async () => {
    const result = await new SetupBatchWorkspaceAdapter().render(createDefaultSetupConfiguration(), [
      { path: '.github/workflows/copilot_issue.yml', content: 'jobs: {native: {steps: [{uses: "./", with: {single-action: check_branch_sync_action}}]}}\n' },
    ]);
    expect(result.find(file => file.path === '.copilot/repository-profile.json')?.content).toContain('installation');
  });
  it.each(['.copilot/AGENT_GUIDE.md', '.copilot/repository-profile.json', '.copilot/setup-manifest.json',
    '.agents/skills/copilot-repository-workflow/SKILL.md'])('blocks partial source guidance with missing %s before reconciling any existing artifact', async missing => {
    const existing = [
      { path: '.github/workflows/copilot_issue.yml', content: 'jobs: {native: {steps: [{uses: "./", with: {single-action: check_branch_sync_action}}]}}\n' },
      ...['.copilot/AGENT_GUIDE.md', '.copilot/repository-profile.json', '.copilot/setup-manifest.json',
        '.agents/skills/copilot-repository-workflow/SKILL.md'].filter(path => path !== missing)
        .map(path => ({ path, content: `existing source artifact ${path}` })),
    ];
    const before = JSON.stringify(existing); const copy = jest.spyOn(setupFiles, 'copySetupFiles');
    try {
      await expect(new SetupBatchWorkspaceAdapter().render(createDefaultSetupConfiguration(), existing))
        .rejects.toThrow('Restore it with the checked-in source generator');
      expect(copy).not.toHaveBeenCalled(); expect(JSON.stringify(existing)).toBe(before);
    } finally { copy.mockRestore(); }
  });
  it('retains target-specific runner locations in real package templates and keeps the approval observer isolated', async () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    const content = readFileSync(join(__dirname, '..', '..', '..', 'setup', 'workflows', 'copilot_pull_request.yml'), 'utf8')
      .replace('runs-on: ubuntu-latest', 'runs-on: [self-hosted, codex, Linux]');
    const existing = [{ path: '.github/workflows/copilot_pull_request.yml', content }];
    const result = await new SetupBatchWorkspaceAdapter().render(configuration, existing);
    const effective = result.find(file => file.path === existing[0].path)?.content ?? content;
    expect(effective).toContain('codex'); expect(effective).not.toContain('runs-on: ubuntu-latest');
    expect(result.find(file => file.path === '.github/workflows/copilot_pull_request_approval.yml')?.content).toContain('runs-on: ubuntu-latest');
  });
  it('produces stable backups across previews and preserves customized human guidance', async () => {
    const renderer = new SetupBatchWorkspaceAdapter(); const configuration = createDefaultSetupConfiguration();
    const existing = [{ path: '.github/workflows/copilot_issue.yml', content: '# reviewed custom workflow\n' }];
    const first = await renderer.render(configuration, existing); const second = await renderer.render(configuration, existing);
    expect(second).toEqual(first);
    expect(first.some(file => file.path.startsWith('.copilot/setup-backups/') && file.content === existing[0].content)).toBe(true);
  });
  it('retains separate reproducible backups for equal basenames and content from distinct asset paths', async () => {
    const renderer = new SetupBatchWorkspaceAdapter(); const configuration = createDefaultSetupConfiguration();
    const originals = ['.github/workflows/config.yml', '.github/ISSUE_TEMPLATE/config.yml'];
    let generation = 0;
    const copy = jest.spyOn(setupFiles, 'copySetupFiles').mockImplementation(directory => {
      const backup = join(directory, '.copilot', 'setup-backups', `preview-${++generation}`);
      for (const original of originals) {
        const destination = join(backup, original);
        mkdirSync(join(destination, '..'), { recursive: true }); writeFileSync(destination, '# identical original content\n');
      }
      return { copied: originals.length, skipped: 0 };
    });
    try {
      const historical = [{ path: '.copilot/setup-backups/history/old.yml', content: '# retained history\n' }];
      const first = await renderer.render(configuration, historical);
      expect(first).toHaveLength(2);
      for (const original of originals) expect(first.find(file => file.path.endsWith(`/${original}`)))
        .toMatchObject({ content: '# identical original content\n' });
      expect(await renderer.render(configuration, historical)).toEqual(first);
    } finally { copy.mockRestore(); }
  });
  it.each([{ path: '../secret', content: 'fixture' }, { path: 'AGENTS.md', content: 'x'.repeat(100_001) },
    { path: 'AGENTS.md', content: null }])('rejects unsafe input before rendering %j', async file => {
    await expect(new SetupBatchWorkspaceAdapter().render(createDefaultSetupConfiguration(), [file])).rejects.toThrow('budget');
  });
});
