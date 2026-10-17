import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupBatchWorkspaceAdapter } from '../setup_batch_workspace_adapter';
import { SetupBatchJournalAdapter } from '../setup_batch_journal_adapter';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import * as setupFiles from '../../utils/setup_files';
import type { SetupBatchOperation } from '../../domain/setup_batch';
const id = 'a67c8e40-93be-43ed-a7ed-e07378c7e773';
const operation: SetupBatchOperation = { schemaVersion: 1, operationId: id, organization: 'acme', targets: [{ repositoryId: 7,
  repository: 'repo', defaultBranch: 'master', baseSha: 'a'.repeat(40), planDigest: 'b'.repeat(64), status: 'ready', effects: [] }] };
describe('isolated setup rendering and private durable receipts', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'copilot-batch-test-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
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
  it('has no file effects when the target already matches the renderer', async () => {
    const renderer = new SetupBatchWorkspaceAdapter(); const configuration = createDefaultSetupConfiguration();
    const first = await renderer.render(configuration, []);
    expect(await renderer.render(configuration, first)).toEqual([]);
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
