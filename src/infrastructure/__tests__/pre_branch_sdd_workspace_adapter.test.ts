import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PreBranchSddWorkspaceAdapter } from '../pre_branch_sdd_workspace_adapter';
import type { SddPlan } from '../../domain/pre_branch_sdd';

jest.setTimeout(30_000);

const plan: SddPlan = {
  action: 'update', path: 'specs/payments.md', capabilityId: 'payments',
  reason: 'The issue modifies the existing payment behavior and its acceptance contract.', questions: [],
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-sdd-workspace-test-'));
  const remote = path.join(temp, 'remote.git');
  const repo = path.join(temp, 'repo');
  fs.mkdirSync(repo);
  git(temp, 'init', '--bare', remote);
  git(repo, 'init');
  git(repo, 'config', 'user.name', 'Test Maintainer');
  git(repo, 'config', 'user.email', 'maintainer@example.test');
  fs.mkdirSync(path.join(repo, 'specs'));
  fs.mkdirSync(path.join(repo, 'src'));
  fs.mkdirSync(path.join(repo, 'docs'));
  fs.writeFileSync(path.join(repo, 'specs/README.md'), '# Specification standard\n');
  fs.writeFileSync(path.join(repo, 'specs/_template.md'), '# Template\n');
  fs.writeFileSync(path.join(repo, 'specs/payments.md'), '# Existing payment contract\n');
  fs.writeFileSync(path.join(repo, 'specs/CATALOG.md'), '# Catalog\n');
  fs.writeFileSync(path.join(repo, 'src/index.ts'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(repo, 'src/index.test.ts'), 'export const test = true;\n');
  fs.writeFileSync(path.join(repo, 'docs/payments.mdx'), '# Payments\n');
  fs.writeFileSync(path.join(repo, 'specs/catalog.json'), `${JSON.stringify({
    version: 1,
    capabilities: [{
      id: 'payments', title: 'Payments', status: 'proposed', scope: 'Payment behavior', owner: 'Maintainers', lastVerified: '2026-09-17',
      specs: ['specs/payments.md'], workflows: [], entrypoints: ['src/index.ts'], code: ['src/index.ts'], tests: ['src/index.test.ts'], documentation: ['docs/payments.mdx'],
    }],
  }, null, 2)}\n`);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'initial');
  git(repo, 'branch', '-M', 'develop');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-u', 'origin', 'develop');
  return { temp, remote, repo };
}

function draft(): string {
  return `# Payment behavior\n\n- Status: Draft\n- Date: 2026-09-17\n- Catalog capability ID: payments\n- Owners: Maintainers\n\n## 1. Executive summary\n${'The payment behavior has a verified product contract. '.repeat(20)}\n\n## 4. Goals\n${'The new behavior preserves authorization and traceability. '.repeat(12)}\n\n## 8. Clean Architecture\n${'The domain policy is separate from application orchestration and adapters. '.repeat(12)}\n\n## 14. Testing strategy\nAt least 20 distinct cases cover success, replay, authorization, and failure.\n\n## 16. Acceptance scenarios\n${'The issue owner can verify the resulting payment contract. '.repeat(12)}\n`;
}

describe('PreBranchSddWorkspaceAdapter with a local bare remote', () => {
  let temp: string;
  let repo: string;

  beforeEach(() => { ({ temp, repo } = fixture()); });
  afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

  it('validates before branch creation and makes the SDD the only first branch change', async () => {
    const workspace = new PreBranchSddWorkspaceAdapter(repo);
    const snapshot = await workspace.loadSnapshot('develop');
    const prepared = await workspace.validateDraft(snapshot, plan, draft());
    expect(prepared.changedPaths).toEqual(['specs/payments.md']);
    expect(git(repo, 'branch', '--list', 'feature/42-change')).toBe('');
    git(repo, 'push', 'origin', 'develop:refs/heads/feature/42-change');

    const commitSha = await workspace.publish('feature/42-change', prepared);
    expect(await workspace.verifyPublication('feature/42-change', snapshot.baseSha, commitSha, plan.path)).toBe(true);
    expect(await workspace.recoverPublished('feature/42-change', prepared)).toBe(commitSha);
    expect(await workspace.recoverPublished('feature/42-change', { ...prepared, markdown: `${prepared.markdown}\nregenerated draft` })).toBe(commitSha);
    expect(git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', commitSha)).toBe(plan.path);
    expect(git(repo, 'rev-parse', `${commitSha}^`)).toBe(snapshot.baseSha);
  });

  it('retains an existing branch with unrelated commits and blocks an SDD first-commit rewrite', async () => {
    const workspace = new PreBranchSddWorkspaceAdapter(repo);
    const snapshot = await workspace.loadSnapshot('develop');
    const prepared = await workspace.validateDraft(snapshot, plan, draft());
    git(repo, 'checkout', '-b', 'feature/42-change');
    fs.writeFileSync(path.join(repo, 'src/index.ts'), 'export const value = 2;\n');
    git(repo, 'add', 'src/index.ts');
    git(repo, 'commit', '-m', 'unrelated code');
    git(repo, 'push', 'origin', 'feature/42-change');
    await expect(workspace.publish('feature/42-change', prepared)).rejects.toThrow('already contains commits');
    await expect(workspace.recoverPublished('feature/42-change', prepared)).resolves.toBeUndefined();
  });

  it('adds a companion SDD and its generated catalog as the only first-commit files', async () => {
    const workspace = new PreBranchSddWorkspaceAdapter(repo);
    const snapshot = await workspace.loadSnapshot('develop');
    const companion: SddPlan = { ...plan, action: 'companion', path: 'specs/payments-extension.md' };
    const prepared = await workspace.validateDraft(snapshot, companion, draft());
    expect(prepared.changedPaths).toEqual(['specs/CATALOG.md', 'specs/catalog.json', companion.path]);
    expect(JSON.parse(prepared.catalogJson!).capabilities[0].specs).toEqual([plan.path, companion.path]);
    git(repo, 'push', 'origin', 'develop:refs/heads/feature/42-change');

    const commitSha = await workspace.publish('feature/42-change', prepared);
    expect(git(repo, 'diff-tree', '--no-commit-id', '--name-only', '-r', commitSha).split('\n').sort()).toEqual(prepared.changedPaths);
    expect(await workspace.recoverPublished('feature/42-change', prepared)).toBe(commitSha);
  });

  it('registers a new proposed capability and recovers its validated first commit', async () => {
    const workspace = new PreBranchSddWorkspaceAdapter(repo);
    const snapshot = await workspace.loadSnapshot('develop');
    const proposal: SddPlan = { ...plan, action: 'new', path: 'specs/invoicing.md', capabilityId: 'invoicing' };
    const capability = {
      ...snapshot.capabilities[0], id: 'invoicing', title: 'Invoicing', status: 'proposed' as const,
      scope: 'Invoice behavior', specs: [proposal.path],
    };
    const prepared = await workspace.validateDraft(snapshot, proposal, draft(), capability);
    expect(prepared.changedPaths).toEqual(['specs/CATALOG.md', 'specs/catalog.json', proposal.path]);
    git(repo, 'push', 'origin', 'develop:refs/heads/feature/42-change');

    const commitSha = await workspace.publish('feature/42-change', prepared);
    expect(await workspace.recoverPublished('feature/42-change', prepared)).toBe(commitSha);
    expect(JSON.parse(git(repo, 'show', `${commitSha}:specs/catalog.json`)).capabilities).toHaveLength(2);
  });

  it('rejects an invalid proposed catalog owner before creating a branch', async () => {
    const workspace = new PreBranchSddWorkspaceAdapter(repo);
    const snapshot = await workspace.loadSnapshot('develop');
    const proposal: SddPlan = { ...plan, action: 'new', path: 'specs/invoicing.md', capabilityId: 'invoicing' };
    await expect(workspace.validateDraft(snapshot, proposal, draft())).rejects.toThrow('proposed catalog capability');
    expect(git(repo, 'branch', '--list', 'feature/42-change')).toBe('');
  });

  it('does not recover a matching-looking first commit authored outside the Action', async () => {
    const workspace = new PreBranchSddWorkspaceAdapter(repo);
    const snapshot = await workspace.loadSnapshot('develop');
    const prepared = await workspace.validateDraft(snapshot, plan, draft());
    git(repo, 'checkout', '-b', 'feature/42-change');
    fs.writeFileSync(path.join(repo, plan.path), prepared.markdown);
    git(repo, 'add', '--', plan.path);
    git(repo, 'commit', '-m', `docs(sdd): specify issue contract in ${plan.path}`);
    git(repo, 'push', 'origin', 'feature/42-change');
    expect(await workspace.recoverPublished('feature/42-change', prepared)).toBeUndefined();
  });

  it('rejects a symlinked generated catalog before writing metadata', async () => {
    const external = path.join(temp, 'outside-catalog.md');
    fs.copyFileSync(path.join(repo, 'specs/CATALOG.md'), external);
    fs.rmSync(path.join(repo, 'specs/CATALOG.md'));
    fs.symlinkSync(external, path.join(repo, 'specs/CATALOG.md'));
    git(repo, 'add', 'specs/CATALOG.md');
    git(repo, 'commit', '-m', 'symlinked catalog');
    git(repo, 'push', 'origin', 'develop');
    const workspace = new PreBranchSddWorkspaceAdapter(repo);
    const snapshot = await workspace.loadSnapshot('develop');
    const companion: SddPlan = { ...plan, action: 'companion', path: 'specs/payments-extension.md' };
    await expect(workspace.validateDraft(snapshot, companion, draft())).rejects.toThrow('not a regular file');
    expect(fs.readFileSync(external, 'utf8')).toBe('# Catalog\n');
  });

  it('rejects a symlinked owning SDD before writing to its target', async () => {
    const external = path.join(temp, 'outside.md');
    fs.writeFileSync(external, '# Protected external file\n');
    fs.rmSync(path.join(repo, 'specs/payments.md'));
    fs.symlinkSync(external, path.join(repo, 'specs/payments.md'));
    git(repo, 'add', 'specs/payments.md');
    git(repo, 'commit', '-m', 'symlinked specification');
    git(repo, 'push', 'origin', 'develop');
    const workspace = new PreBranchSddWorkspaceAdapter(repo);
    const snapshot = await workspace.loadSnapshot('develop');
    await expect(workspace.validateDraft(snapshot, plan, draft())).rejects.toThrow('not a regular file');
    expect(fs.readFileSync(external, 'utf8')).toBe('# Protected external file\n');
  });
});
