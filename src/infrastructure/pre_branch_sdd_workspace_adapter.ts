import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  PreBranchSddWorkspacePort,
  SddCatalogCapability,
  SddCatalogSnapshot,
  SddPreparedDraft,
} from '../application/ports/pre_branch_sdd_ports';
import { isSafeSddPath, validateSddMarkdown, type SddPlan } from '../domain/pre_branch_sdd';
import { buildGitAuthenticationEnvironment } from './git_authentication_environment';

const runFile = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/i;
const BRANCH = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
// The shared catalog validator is CommonJS so the setup CLI and bundled Action use identical rules.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const validator = require('./specification_catalog_validator.cjs') as {
  validateCatalog(root: string, catalog: unknown): string[];
  renderCatalog(catalog: unknown): string;
};

interface Catalog { readonly version: 1; readonly capabilities: readonly SddCatalogCapability[] }

/** Isolates SDD validation in a detached temporary worktree before the linked branch is created. */
export class PreBranchSddWorkspaceAdapter implements PreBranchSddWorkspacePort {
  constructor(private readonly repositoryRoot: string = process.cwd(), private readonly token: string = '') {}

  async loadSnapshot(baseBranch: string): Promise<SddCatalogSnapshot> {
    assertBranch(baseBranch);
    await this.git(['fetch', 'origin', baseBranch], this.repositoryRoot, this.token);
    const baseSha = (await this.git(['rev-parse', 'FETCH_HEAD'])).trim();
    assertSha(baseSha);
    return this.readSnapshotAtSha(baseSha);
  }

  private async readSnapshotAtSha(baseSha: string): Promise<SddCatalogSnapshot> {
    const raw = await this.git(['show', `${baseSha}:specs/catalog.json`]);
    const catalog = JSON.parse(raw) as Catalog;
    if (catalog.version !== 1 || !Array.isArray(catalog.capabilities)) {
      throw new Error('The repository has no valid SDD catalog. Run setup for specifications before enabling pre-branch-sdd.');
    }
    const [template, standard] = await Promise.all([
      this.git(['show', `${baseSha}:specs/_template.md`]),
      this.git(['show', `${baseSha}:specs/README.md`]),
    ]);
    return Object.freeze({ baseSha, capabilities: Object.freeze(catalog.capabilities), template, standard });
  }

  async readSdd(baseSha: string, relativePath: string): Promise<string | undefined> {
    assertSha(baseSha);
    if (!isSafeSddPath(relativePath)) throw new Error('SDD path is outside the specification boundary.');
    try {
      return await this.git(['show', `${baseSha}:${relativePath}`]);
    } catch {
      return undefined;
    }
  }

  async validateDraft(
    snapshot: SddCatalogSnapshot,
    plan: SddPlan,
    markdown: string,
    newCapability?: SddCatalogCapability,
  ): Promise<SddPreparedDraft> {
    assertSha(snapshot.baseSha);
    if (!isSafeSddPath(plan.path)) throw new Error('SDD path is unsafe.');
    validateSddMarkdown(markdown);
    const root = await this.addDetachedWorktree(snapshot.baseSha);
    try {
      assertSpecDirectory(root);
      const target = path.join(root, plan.path);
      if (fs.existsSync(target) !== (plan.action === 'update')) {
        throw new Error('The SDD owner changed since analysis; restart clarification.');
      }
      if (plan.action === 'update') assertRegularSpecFile(target);
      else if (pathExists(target)) throw new Error('The new SDD path is already occupied.');
      writeSpecFile(target, markdown, plan.action === 'update');
      const catalog: Catalog = {
        version: 1,
        capabilities: snapshot.capabilities.map(capability => ({ ...capability, specs: [...capability.specs] })),
      };
      let catalogJson: string | undefined;
      let catalogMarkdown: string | undefined;
      if (plan.action === 'companion') {
        const owner = catalog.capabilities.find(capability => capability.id === plan.capabilityId);
        if (!owner || owner.specs.includes(plan.path)) throw new Error('Companion SDD ownership is ambiguous.');
        const updated = catalog.capabilities.map(capability => capability.id === owner.id
          ? { ...capability, specs: [...capability.specs, plan.path] }
          : capability);
        catalogJson = `${JSON.stringify({ version: 1, capabilities: updated }, null, 2)}\n`;
      } else if (plan.action === 'new') {
        if (!newCapability || newCapability.id !== plan.capabilityId
          || newCapability.status !== 'proposed'
          || newCapability.specs.length !== 1 || newCapability.specs[0] !== plan.path) {
          throw new Error('A new SDD needs one proposed catalog capability with the exact owner path.');
        }
        catalogJson = `${JSON.stringify({ version: 1, capabilities: [...catalog.capabilities, newCapability] }, null, 2)}\n`;
      }
      if (catalogJson) {
        assertRegularSpecFile(path.join(root, 'specs/catalog.json'));
        assertRegularSpecFile(path.join(root, 'specs/CATALOG.md'));
        writeSpecFile(path.join(root, 'specs/catalog.json'), catalogJson, true);
        const updated = JSON.parse(catalogJson) as Catalog;
        catalogMarkdown = validator.renderCatalog(updated);
        writeSpecFile(path.join(root, 'specs/CATALOG.md'), catalogMarkdown, true);
      }
      const checked = catalogJson ? JSON.parse(catalogJson) as Catalog : catalog;
      const errors = validator.validateCatalog(root, checked);
      if (errors.length > 0) throw new Error(`SDD validation failed: ${errors.slice(0, 8).join('; ')}`);
      const changedPaths = await this.changedPaths(root);
      const allowed = new Set([plan.path, ...(catalogJson ? ['specs/catalog.json', 'specs/CATALOG.md'] : [])]);
      if (!changedPaths.includes(plan.path) || changedPaths.some(changed => !allowed.has(changed))) {
        throw new Error('The draft changed files outside the SDD/catalog allowlist.');
      }
      return Object.freeze({
        plan, baseSha: snapshot.baseSha, markdown,
        ...(catalogJson ? { catalogJson, catalogMarkdown } : {}),
        changedPaths: Object.freeze(changedPaths),
      });
    } finally {
      await this.removeWorktree(root);
    }
  }

  async publish(branchName: string, prepared: SddPreparedDraft): Promise<string> {
    assertBranch(branchName);
    assertSha(prepared.baseSha);
    if (!isSafeSddPath(prepared.plan.path)) throw new Error('SDD path is unsafe.');
    await this.git(['fetch', 'origin', branchName], this.repositoryRoot, this.token);
    const currentSha = (await this.git(['rev-parse', 'FETCH_HEAD'])).trim();
    if (currentSha !== prepared.baseSha) {
      throw new Error(`Linked branch ${branchName} already contains commits; its first SDD commit cannot be rewritten.`);
    }
    const root = await this.addDetachedWorktree(currentSha);
    try {
      assertSpecDirectory(root);
      if (prepared.plan.action === 'update') assertRegularSpecFile(path.join(root, prepared.plan.path));
      else if (pathExists(path.join(root, prepared.plan.path))) throw new Error('The new SDD path is already occupied.');
      writeSpecFile(path.join(root, prepared.plan.path), prepared.markdown, prepared.plan.action === 'update');
      if (prepared.catalogJson && prepared.catalogMarkdown) {
        assertRegularSpecFile(path.join(root, 'specs/catalog.json'));
        assertRegularSpecFile(path.join(root, 'specs/CATALOG.md'));
        writeSpecFile(path.join(root, 'specs/catalog.json'), prepared.catalogJson, true);
        writeSpecFile(path.join(root, 'specs/CATALOG.md'), prepared.catalogMarkdown, true);
      }
      await this.git(['add', '--', ...prepared.changedPaths], root);
      const staged = (await this.git(['diff', '--cached', '--name-only'], root)).trim().split('\n').filter(Boolean);
      if (staged.join('\n') !== [...prepared.changedPaths].sort().join('\n')) {
        throw new Error('The staged paths differ from the validated SDD draft.');
      }
      await this.git([
        '-c', 'user.name=copilot-action[bot]',
        '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit', '-m', `docs(sdd): specify issue contract in ${prepared.plan.path}`,
      ], root);
      const commitSha = (await this.git(['rev-parse', 'HEAD'], root)).trim();
      assertSha(commitSha);
      await this.git(['push', 'origin', `HEAD:refs/heads/${branchName}`], root, this.token);
      const verified = await this.verifyPublication(branchName, prepared.baseSha, commitSha, prepared.plan.path);
      if (!verified) throw new Error('The SDD commit was pushed but could not be verified remotely. Retry on the same branch.');
      return commitSha;
    } finally {
      await this.removeWorktree(root);
    }
  }

  async recoverPublished(branchName: string, prepared: SddPreparedDraft): Promise<string | undefined> {
    assertBranch(branchName);
    assertSha(prepared.baseSha);
    if (!isSafeSddPath(prepared.plan.path)) return undefined;
    await this.git(['fetch', 'origin', branchName], this.repositoryRoot, this.token);
    const remoteSha = (await this.git(['rev-parse', 'FETCH_HEAD'])).trim();
    if (remoteSha === prepared.baseSha) return undefined;
    let descendants: string[];
    try {
      descendants = (await this.git(['rev-list', '--reverse', `${prepared.baseSha}..${remoteSha}`])).trim().split('\n').filter(Boolean);
    } catch {
      return undefined;
    }
    const first = descendants[0];
    if (!first || !await this.verifyPublication(branchName, prepared.baseSha, first, prepared.plan.path)) return undefined;
    const [author, subject] = await Promise.all([
      this.git(['show', '-s', '--format=%ae', first]),
      this.git(['show', '-s', '--format=%s', first]),
    ]);
    if (author.trim() !== '41898282+github-actions[bot]@users.noreply.github.com'
      || subject.trim() !== `docs(sdd): specify issue contract in ${prepared.plan.path}`) return undefined;
    const content = await this.git(['show', `${first}:${prepared.plan.path}`]);
    const snapshot = await this.readSnapshotAtSha(prepared.baseSha);
    let newCapability: SddCatalogCapability | undefined;
    if (prepared.plan.action === 'new') {
      const raw = await this.git(['show', `${first}:specs/catalog.json`]);
      newCapability = (JSON.parse(raw) as Catalog).capabilities.find(capability => capability.id === prepared.plan.capabilityId);
    }
    const recovered = await this.validateDraft(snapshot, prepared.plan, content, newCapability);
    const committedPaths = (await this.git(['diff-tree', '--no-commit-id', '--name-only', '-r', first])).trim().split('\n').filter(Boolean).sort();
    if (committedPaths.join('\n') !== recovered.changedPaths.join('\n')) return undefined;
    if (recovered.catalogJson && await this.git(['show', `${first}:specs/catalog.json`]) !== recovered.catalogJson) return undefined;
    if (recovered.catalogMarkdown && await this.git(['show', `${first}:specs/CATALOG.md`]) !== recovered.catalogMarkdown) return undefined;
    return first;
  }

  async verifyPublication(branchName: string, baseSha: string, commitSha: string, sddPath: string): Promise<boolean> {
    assertBranch(branchName);
    assertSha(baseSha);
    assertSha(commitSha);
    if (!isSafeSddPath(sddPath)) return false;
    await this.git(['fetch', 'origin', branchName], this.repositoryRoot, this.token);
    const remoteSha = (await this.git(['rev-parse', 'FETCH_HEAD'])).trim();
    const parent = (await this.git(['rev-parse', `${commitSha}^`])).trim();
    if (parent !== baseSha) return false;
    try {
      await this.git(['merge-base', '--is-ancestor', commitSha, remoteSha]);
    } catch {
      return false;
    }
    const paths = (await this.git(['diff-tree', '--no-commit-id', '--name-only', '-r', commitSha])).trim().split('\n').filter(Boolean);
    return paths.includes(sddPath)
      && paths.every(candidate => [sddPath, 'specs/catalog.json', 'specs/CATALOG.md'].includes(candidate));
  }

  private async changedPaths(root: string): Promise<string[]> {
    const output = await this.git(['status', '--porcelain', '--untracked-files=all'], root);
    return output.split('\n').filter(Boolean).map(line => line.slice(3)).sort();
  }

  private async addDetachedWorktree(sha: string): Promise<string> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-sdd-'));
    try {
      await this.git(['worktree', 'add', '--detach', root, sha]);
      return root;
    } catch (error) {
      fs.rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }

  private async removeWorktree(root: string): Promise<void> {
    try {
      await this.git(['worktree', 'remove', '--force', root]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  private async git(args: string[], cwd = this.repositoryRoot, token?: string): Promise<string> {
    const baseEnvironment = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] =>
        entry[1] !== undefined && !entry[0].startsWith('GIT_')),
    );
    const env = token ? buildGitAuthenticationEnvironment(token, baseEnvironment) : baseEnvironment;
    const { stdout } = await runFile('git', args, {
      cwd,
      env,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  }
}

function assertSha(value: string): void {
  if (!SHA.test(value)) throw new Error('Git returned an invalid commit SHA.');
}

function assertBranch(value: string): void {
  if (!BRANCH.test(value) || value.includes('..') || value.includes('//') || value.endsWith('.lock')) {
    throw new Error('The configured branch name is unsafe.');
  }
}

function assertSpecDirectory(root: string): void {
  const directory = path.join(root, 'specs');
  if (!fs.lstatSync(directory).isDirectory()
    || fs.realpathSync(directory) !== path.join(fs.realpathSync(root), 'specs')) {
    throw new Error('The specification directory is not a real directory inside the detached worktree.');
  }
}

function assertRegularSpecFile(target: string): void {
  if (!fs.lstatSync(target).isFile()) throw new Error('A specification or catalog path is not a regular file.');
}

function pathExists(target: string): boolean {
  try { fs.lstatSync(target); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function writeSpecFile(target: string, content: string, exists: boolean): void {
  const flags = fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW
    | (exists ? fs.constants.O_TRUNC : fs.constants.O_CREAT | fs.constants.O_EXCL);
  const descriptor = fs.openSync(target, flags, 0o644);
  try { fs.writeFileSync(descriptor, content, 'utf8'); } finally { fs.closeSync(descriptor); }
}
