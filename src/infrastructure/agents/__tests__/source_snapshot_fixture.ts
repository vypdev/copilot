import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { AgentExecutionPlanner } from '../agent_execution_planner';
import { getAgentRuntimeManifestEntry } from '../agent_runtime_manifest';
import { makeWindowsRuntimePathPrivate } from '../windows_runtime_acl';
import type { AgentProvider } from '../../../domain/agent';
import type { AgentSourceSnapshot } from '../../../domain/agent_source_snapshot';
import { sddConsistencyFixture } from '../../../testing/sdd_consistency_fixture';

/** Native local-only fixture. Never invokes a provider, network, hooks or a task checkout mutation. */
export function sourceSnapshotFixture(withSdd = false) {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'copilot-source-context-fixture-')));
    const root = join(directory, 'anchor'), hooks = join(directory, 'hooks');
    mkdirSync(root); mkdirSync(hooks);
    const git = (...args: string[]) => execFileSync('git', ['-c', `core.hooksPath=${hooks}`, ...args], {
        cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000,
        env: { ...process.env, GIT_CONFIG_GLOBAL: join(directory, 'empty.config'), GIT_CONFIG_NOSYSTEM: '1' },
    }).trim();
    writeFileSync(join(directory, 'empty.config'), '');
    git('init', '--quiet'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
    writeFileSync(join(root, 'README.md'), '# Bootstrap\n'); git('add', '.'); git('commit', '-qm', 'bootstrap');
    const anchor = git('rev-parse', 'HEAD');
    const files: Record<string, Buffer> = {
        '.gitattributes': Buffer.from('*.txt text eol=crlf ident\nhidden.txt export-ignore\nsubst.txt export-subst\n'),
        'raw.txt': Buffer.from('raw\r\n$Id$\r\n'), 'hidden.txt': Buffer.from('tracked, never omitted\n'),
        'subst.txt': Buffer.from('$Format:%H$\n'), 'nested/é-model.bin': Buffer.from([0, 255, 13, 10, 128]),
        'scripts/check.sh': Buffer.from('#!/bin/sh\nexit 0\n'),
    };
    if (withSdd) {
        Object.assign(files, {
            // Publication uses a real checkout: keep this fixture's plumbing-written CRLF blob checkout-stable.
            '.gitattributes': Buffer.from('* -text -ident -filter -working-tree-encoding\n'),
            'specs/README.md': Buffer.from('# Specification standard\n'), 'specs/_template.md': Buffer.from('# Canonical template\n'),
            'specs/payments.md': Buffer.from(sddConsistencyFixture('payments-baseline', 'specs/payments.md', 'update')),
            'docs/payments.mdx': Buffer.from('# Payment guide\n'), 'src/index.ts': Buffer.from('export const value=1;\n'),
            'src/index.test.ts': Buffer.from('export const fixture=true;\n'),
            'specs/catalog.json': Buffer.from(JSON.stringify({ version: 1, capabilities: [{ id: 'payments', title: 'Payments', status: 'proposed',
                scope: 'Payment behavior', owner: 'Maintainers', lastVerified: '2026-11-02', specs: ['specs/payments.md'], workflows: [],
                entrypoints: ['src/index.ts'], code: ['src/index.ts'], tests: ['src/index.test.ts'], documentation: ['docs/payments.mdx'] }] }) + '\n'),
        });
    }
    for (const [path, value] of Object.entries(files)) {
        const components = path.split('/'); components.pop();
        mkdirSync(join(root, ...components), { recursive: true }); writeFileSync(join(root, path), value);
    }
    git('-c', 'core.autocrlf=false', '-c', 'core.attributesfile=', 'add', '.');
    // Write blob bytes directly into the index, bypassing even fixture attributes.
    for (const [path, value] of Object.entries(files)) {
        const id = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: value, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        git('update-index', '--cacheinfo', path === 'scripts/check.sh' ? '100755' : '100644', id, path);
    }
    git('commit', '-qm', 'selected source'); const selected = git('rev-parse', 'HEAD');
    git('checkout', '--detach', '--force', anchor);
    const executable = join(directory, process.platform === 'win32' ? 'node.exe' : 'agent');
    if (process.platform === 'win32') { copyFileSync(process.execPath, executable); makeWindowsRuntimePathPrivate(directory, true); makeWindowsRuntimePathPrivate(executable, false); }
    else { writeFileSync(executable, '#!/bin/sh\nexit 0\n'); chmodSync(executable, 0o700); }
    const source: AgentSourceSnapshot = Object.freeze({ kind: 'pre-branch-sdd', phase: 'analysis', baseSha: selected });
    const planner = (provider: AgentProvider = 'codex') => new AgentExecutionPlanner({ resolveWorkspace: () => root,
        resolveExecutable: () => executable, readVersion: () => getAgentRuntimeManifestEntry(provider).reviewedVersion });
    const prepare = (provider: AgentProvider = 'codex') => planner(provider).prepare({
        configuration: { provider, model: 'fixture-model' }, capability: 'findings', prompt: 'Read immutable source.',
        timeoutMs: 30_000, cwd: root, sourceSnapshot: source,
    });
    const outerFacts = () => ({ head: git('rev-parse', 'HEAD'), status: git('status', '--porcelain'),
        index: createHash('sha256').update(readFileSync(join(root, '.git', 'index'))).digest('hex'), worktrees: git('worktree', 'list', '--porcelain') });
    return { directory, root, hooks, git, anchor, selected, files, source, executable, planner, prepare, outerFacts,
        cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
