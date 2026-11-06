import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { sourceSnapshotFixture } from './source_snapshot_fixture';
import { sourceSnapshotFiles } from '../agent_source_snapshot_workspace';
import { verifySourceSnapshotWorkspace } from '../agent_source_snapshot_integrity';
import { runAgentCli } from '../../../data/repository/agent_cli_execution';
import { SddSourceContextFailure } from '../../../domain/agent_source_snapshot';
import type { AgentExecutionPlan } from '../../../domain/agent_execution_plan';
import { AgentExecutionPlanner } from '../agent_execution_planner';

jest.setTimeout(30_000);
let fixture: ReturnType<typeof sourceSnapshotFixture>;
const plans: AgentExecutionPlan[] = [];
let priorWorkspace: string | undefined;
const prepare = (provider: 'codex' | 'opencode' | 'cursor' = 'codex') => { const plan = fixture.prepare(provider); plans.push(plan); return plan; };
const verify = (plan: AgentExecutionPlan) => verifySourceSnapshotWorkspace(plan.sourceSnapshot!, plan.workspace, plan.runtimeDirectory, plan.artifacts);
beforeAll(() => { fixture = sourceSnapshotFixture(); });
beforeEach(() => { priorWorkspace = process.env.GITHUB_WORKSPACE; if (process.env.GITHUB_ACTIONS === 'true') process.env.GITHUB_WORKSPACE = fixture.root; });
afterEach(() => {
    if (priorWorkspace === undefined) delete process.env.GITHUB_WORKSPACE; else process.env.GITHUB_WORKSPACE = priorWorkspace;
    jest.restoreAllMocks(); for (const plan of plans.splice(0)) rmSync(plan.runtimeDirectory, { recursive: true, force: true });
});
afterAll(() => fixture.cleanup());

it('source-context-C10: a source binding cannot bypass canonical anchor or Actions checkout guards', () => {
    const previous = { actions: process.env.GITHUB_ACTIONS, workspace: process.env.GITHUB_WORKSPACE };
    const nested = join(fixture.root, 'nested-untracked'); mkdirSync(nested);
    try {
        process.env.GITHUB_ACTIONS = 'true'; process.env.GITHUB_WORKSPACE = fixture.directory;
        const request = { configuration: { provider: 'codex' as const, model: 'model' }, capability: 'findings' as const,
            prompt: 'Read.', timeoutMs: 30_000, cwd: fixture.root, sourceSnapshot: fixture.source };
        expect(() => new AgentExecutionPlanner().prepare(request)).toThrow('canonical GitHub checkout root');
        process.env.GITHUB_WORKSPACE = fixture.root;
        expect(() => new AgentExecutionPlanner().prepare({ ...request, cwd: nested })).toThrow('canonical repository root');
    } finally {
        for (const [key, value] of [['GITHUB_ACTIONS', previous.actions], ['GITHUB_WORKSPACE', previous.workspace]]) {
            if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
        }
        rmSync(nested, { recursive: true });
    }
});
it('source-context-C11: a source binding does not broaden execution maxima', () => {
    const request = { configuration: { provider: 'codex' as const, model: 'model' }, capability: 'findings' as const,
        prompt: 'Read.', timeoutMs: 30_000, sourceSnapshot: fixture.source };
    for (const invalid of [{ timeoutMs: 900001 }, { maxPromptBytes: 524289 }, { maxOutputBytes: 4194305 }]) {
        expect(() => fixture.planner().prepare({ ...request, ...invalid })).toThrow('must be a finite positive number');
    }
});

it('source-context-C15/source-context-C16/source-context-C17/source-context-C28: imports every exact blob without attributes/archive conversion or outer mutations', () => {
    const before = fixture.outerFacts(), plan = prepare();
    expect(plan.workspace).not.toBe(fixture.root); expect(plan.sourceSnapshot?.baseSha).toBe(fixture.selected);
    for (const [path, bytes] of Object.entries(fixture.files)) expect(readFileSync(join(plan.workspace, path))).toEqual(bytes);
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: plan.workspace, encoding: 'utf8' }).trim()).toBe(fixture.selected);
    if (process.platform !== 'win32') expect(lstatSync(join(plan.workspace, 'scripts/check.sh')).mode & 0o777).toBe(0o500);
    expect(() => verify(plan)).not.toThrow(); expect(fixture.outerFacts()).toEqual(before);
});
it('source-context-C18/source-context-C20: creates independent metadata with no source config, hooks, history or remotes', () => {
    const sentinel = join(fixture.directory, 'forbidden-configuration-ran');
    fixture.git('config', 'core.fsmonitor', `echo sentinel > ${sentinel}`);
    fixture.git('config', 'remote.origin.url', 'https://credential:secret@example.invalid/private');
    try {
        const plan = prepare(), metadata = join(plan.workspace, '.git');
        expect(readFileSync(join(metadata, 'config'), 'utf8')).not.toMatch(/secret|remote|credential/);
        expect(existsSync(join(metadata, 'objects/info/alternates'))).toBe(false);
        expect(() => execFileSync('git', ['--no-lazy-fetch', 'cat-file', '-e', fixture.anchor], { cwd: plan.workspace, stdio: 'pipe' })).toThrow();
        expect(existsSync(sentinel)).toBe(false); expect(readFileSync(join(metadata, 'shallow'), 'utf8')).toBe(`${fixture.selected}\n`);
        expect(() => verify(plan)).not.toThrow();
    } finally { fixture.git('config', '--unset', 'core.fsmonitor'); fixture.git('config', '--remove-section', 'remote.origin'); }
});
it('source-context-C19: excludes dirty/untracked anchor state and retains it byte-for-byte', () => {
    writeFileSync(join(fixture.root, 'README.md'), 'uncommitted owner text'); writeFileSync(join(fixture.root, 'private-untracked.txt'), 'private-token');
    try {
        const before = fixture.outerFacts(), plan = prepare();
        expect(readFileSync(join(plan.workspace, 'README.md'), 'utf8')).toBe('# Bootstrap\n');
        expect(existsSync(join(plan.workspace, 'private-untracked.txt'))).toBe(false); expect(fixture.outerFacts()).toEqual(before);
    } finally { writeFileSync(join(fixture.root, 'README.md'), '# Bootstrap\n'); rmSync(join(fixture.root, 'private-untracked.txt')); }
});
it('source-context-C21: selected object identities ignore replacement refs', () => {
    fixture.git('replace', fixture.selected, fixture.anchor);
    try { const plan = prepare(); expect(readFileSync(join(plan.workspace, 'raw.txt'))).toEqual(fixture.files['raw.txt']); verify(plan); }
    finally { fixture.git('replace', '-d', fixture.selected); }
});
it.each(['codex', 'opencode', 'cursor'] as const)('source-context-C31: %s source view retains ordinary read-only authority', provider => {
    const plan = prepare(provider);
    expect(plan).toMatchObject({ capability: 'findings', workspaceMode: 'read-only', childNetwork: 'deny', approval: 'never', sessionPersistence: false });
    expect(plan.argv.join(' ')).not.toMatch(/add-dir|workspace-write|workspace_readwrite|dangerously/);
    expect(plan.timeoutMs).toBeLessThan(30_000); expect(plan.sourceDeadlineMs).toBeGreaterThan(performance.now()); verify(plan);
});
it('source-context-C32/source-context-C55: unknown source blocks before a plan or child can be admitted', () => {
    expect(() => fixture.planner().prepare({ configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'Read.',
        timeoutMs: 30_000, sourceSnapshot: { ...fixture.source, baseSha: 'f'.repeat(40) } })).toThrow(SddSourceContextFailure);
    expect(fixture.git('rev-parse', 'HEAD')).toBe(fixture.anchor);
});
it('source-context-C36: selected-tree provider configuration is rejected without weakening the anchor guard', () => {
    const local = sourceSnapshotFixture();
    try {
        local.git('checkout', '--detach', '--force', local.selected); writeFileSync(join(local.root, 'opencode.json'), '{"permission":"allow"}');
        local.git('add', 'opencode.json'); local.git('commit', '-qm', 'forbidden provider configuration'); const selected = local.git('rev-parse', 'HEAD');
        local.git('checkout', '--detach', '--force', local.anchor);
        expect(() => local.planner('opencode').prepare({ configuration: { provider: 'opencode', model: 'model' }, capability: 'findings',
            prompt: 'Read.', timeoutMs: 30_000, sourceSnapshot: { ...local.source, baseSha: selected } })).toThrow('project configuration');
        expect(local.git('rev-parse', 'HEAD')).toBe(local.anchor);
    } finally { local.cleanup(); }
});
it('source-context-C33: source byte tampering prevents child launch and cleans owned runtime', async () => {
    const plan = prepare(); chmodSync(join(plan.workspace, 'raw.txt'), 0o600); writeFileSync(join(plan.workspace, 'raw.txt'), 'changed');
    await expect(runAgentCli(plan, 'Read.')).rejects.toMatchObject({ reason: 'view-integrity' }); expect(existsSync(plan.runtimeDirectory)).toBe(false);
});
it('source-context-C34: private Git metadata tampering prevents child launch', async () => {
    const plan = prepare(); writeFileSync(join(plan.workspace, '.git', 'config'), '[remote "origin"]\nurl=https://secret@example.invalid\n');
    await expect(runAgentCli(plan, 'Read.')).rejects.toMatchObject({ reason: 'view-integrity' }); expect(existsSync(plan.runtimeDirectory)).toBe(false);
});
it.each(['file', 'directory'] as const)('source-context-C35: additional %s invalidates complete inventory', async kind => {
    const plan = prepare(), target = join(plan.workspace, 'unexpected');
    if (kind === 'file') writeFileSync(target, 'unsealed'); else mkdirSync(target);
    await expect(runAgentCli(plan, 'Read.')).rejects.toMatchObject({ reason: 'view-integrity' }); expect(existsSync(plan.runtimeDirectory)).toBe(false);
});
it('source-context-C38: elapsed admission cannot reset the original monotonic deadline', async () => {
    const plan = prepare();
    await expect(runAgentCli({ ...plan, sourceDeadlineMs: performance.now() - 1 }, 'Read.')).rejects.toMatchObject({ category: 'timeout' });
    expect(existsSync(plan.runtimeDirectory)).toBe(false);
});
it.each(['success', 'failure', 'cancel', 'timeout'] as const)('source-context-C46/source-context-C53: native %s child uses the selected cwd and cleans all owned state', async outcome => {
    const plan = prepare(), receipt = join(fixture.directory, `native-${outcome}.json`), controller = new AbortController();
    const script = `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({cwd:process.cwd(),raw:fs.readFileSync('raw.txt','hex'),head:fs.readFileSync('.git/HEAD','utf8')})); ${outcome === 'failure' ? 'process.exitCode=75;' : outcome === 'cancel' || outcome === 'timeout' ? 'setInterval(()=>{},1000);' : 'process.stdout.write("native-ok");'}`;
    const native = { ...plan, executable: process.execPath, launcherArgv: [], argv: ['-e', script], promptMode: 'stdin' as const,
        outputProtocol: 'plain-text' as const, timeoutMs: outcome === 'timeout' ? 5000 : plan.timeoutMs };
    const result = runAgentCli(native, 'Read.', controller.signal);
    if (outcome === 'cancel') {
        const poll = setInterval(() => { if (existsSync(receipt)) { clearInterval(poll); controller.abort(); } }, 10);
        try { await expect(result).rejects.toMatchObject({ category: 'cancelled' }); } finally { clearInterval(poll); }
    } else if (outcome === 'timeout') await expect(result).rejects.toMatchObject({ category: 'timeout' });
    else if (outcome === 'failure') await expect(result).rejects.toMatchObject({ category: 'process', retryable: true });
    else expect(await result).toBe('native-ok');
    const facts = JSON.parse(readFileSync(receipt, 'utf8'));
    expect(facts).toEqual({ cwd: plan.workspace, raw: fixture.files['raw.txt'].toString('hex'), head: `${fixture.selected}\n` });
    expect(existsSync(plan.runtimeDirectory)).toBe(false); expect(fixture.git('rev-parse', 'HEAD')).toBe(fixture.anchor);
});
it('source-context-C54: matching-base native child still receives an isolated exact view', async () => {
    fixture.git('checkout', '--detach', '--force', fixture.selected);
    try {
        const plan = prepare();
        const result = await runAgentCli({ ...plan, executable: process.execPath, launcherArgv: [], argv: ['-e', 'process.stdout.write(require("node:fs").readFileSync("raw.txt","hex"))'],
            promptMode: 'stdin', outputProtocol: 'plain-text' }, 'Read.');
        expect(result).toBe(fixture.files['raw.txt'].toString('hex')); expect(existsSync(plan.runtimeDirectory)).toBe(false);
    } finally { fixture.git('checkout', '--detach', '--force', fixture.anchor); }
});
it('source-context-C22: a missing promisor object cannot invoke a lazy-fetch helper', () => {
    const missing = sourceSnapshotFixture(), sentinel = join(missing.directory, 'fetch-helper-ran');
    const rawId = missing.git('rev-parse', `${missing.selected}:raw.txt`), objectPath = join(missing.root, '.git', 'objects', rawId.slice(0, 2), rawId.slice(2));
    const objectBytes = readFileSync(objectPath);
    try {
        const helper = join(missing.directory, 'promisor-helper.cjs');
        writeFileSync(helper, `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'called'); process.exitCode=1;`);
        rmSync(objectPath); missing.git('config', 'extensions.partialClone', 'origin'); missing.git('config', 'remote.origin.promisor', 'true');
        missing.git('config', 'remote.origin.url', `ext::${process.execPath} ${helper}`);
        missing.git('config', 'protocol.ext.allow', 'always');
        expect(() => missing.prepare()).toThrow(SddSourceContextFailure); expect(existsSync(sentinel)).toBe(false);
        // Positive control: the same missing object really can invoke this local helper without the production guard.
        expect(() => execFileSync('git', ['-c', 'protocol.ext.allow=always', 'cat-file', '-e', rawId], {
            cwd: missing.root, timeout: 15_000, stdio: 'pipe', env: { ...process.env, GIT_NO_LAZY_FETCH: '0' },
        })).toThrow();
        expect(readFileSync(sentinel, 'utf8')).toBe('called');
    } finally { writeFileSync(objectPath, objectBytes); missing.cleanup(); }
});
it('keeps empty directory observations and rejects nonregular scanner inputs', () => {
    const plan = prepare(), dirs: string[] = [];
    expect(sourceSnapshotFiles(plan.workspace, '', dirs)).toContain('README.md'); expect(dirs).toContain('.git');
    const scan = jest.spyOn(require('node:fs'), 'lstatSync').mockReturnValue({ isSymbolicLink: () => false, isDirectory: () => false, isFile: () => false });
    expect(() => sourceSnapshotFiles(plan.workspace)).toThrow('not regular'); scan.mockRestore();
});
