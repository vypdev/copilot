import { VERIFICATION_NATIVE_SETUP_YAML as yaml } from './verification_native_setup_action';
/** Native CI acceptance: the real Actions runner executes the reviewed YAML between candidate and verifier. */
import * as core from '@actions/core';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { runNativeVerificationEntry } from '../../../infrastructure/native_verification_controller';
import { captureVerificationSetup } from '../../../infrastructure/verification_setup_snapshot';
import { GitCommitAdapter } from '../../../infrastructure/git_commit_adapter';
import { VERIFICATION_SETUP_DIRECTORY, VERIFICATION_SETUP_PATH } from '../../../application/policies/verification_setup_policy';
import { nativeVerificationProfilePaths } from '../../../infrastructure/native_verification_profiles';
import type { PreparedVerificationSetup } from '../../../application/ports/verification_setup_ports';

/** Fixture-only closed facts: never print runtime paths or arbitrary setup metadata. */
function nativeRuntimeRejectionFacts(setup: PreparedVerificationSetup): void {
    const session = process.env.COPILOT_NATIVE_WORKER_SESSION;
    if (!session || setup.kind !== 'ready') return;
    try {
        const home = nativeVerificationProfilePaths(session).at(-1);
        if (!home) return;
        const file = join(home, 'native-setup-result.json');
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16_384) return;
        const result = JSON.parse(readFileSync(file, 'utf8'));
        const roots = [{ role: 'profile', path: home }, { role: 'workspace', path: setup.workspace },
            ...(setup.toolRoot ? [{ role: 'tool-cache', path: setup.toolRoot }] : [])];
        const rootRole = (value: string): string => roots.find(root => {
            const part = relative(root.path, value);
            return part === '' || part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
        })?.role ?? 'outside';
        const classify = (value: unknown): Record<string, string | boolean> => {
            if (typeof value !== 'string') return { kind: 'invalid' };
            const tool = /gradle/iu.test(value) ? 'gradle' : /java|jdk/iu.test(value) ? 'java'
                : /python|venv/iu.test(value) ? 'python' : /pnpm/iu.test(value) ? 'pnpm' : 'other';
            try {
                const actual = realpathSync(value);
                return { tool, lexicalRoot: rootRole(value), canonicalRoot: rootRole(actual), directory: lstatSync(actual).isDirectory() };
            } catch { return { tool, lexicalRoot: rootRole(value), canonicalRoot: 'unreadable', directory: false }; }
        };
        core.info('Native runtime rejection facts: ' + JSON.stringify({
            pathCount: Array.isArray(result.path) ? result.path.length : 'invalid',
            paths: Array.isArray(result.path) ? result.path.slice(0, 8).map(classify) : [],
            javaHome: classify(result.environment?.JAVA_HOME),
        }));
    } catch { core.info('Native runtime rejection facts: unavailable'); }
}

async function fixture(): Promise<void> {
    const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const inputGit = (input: string, ...args: string[]): string => execFileSync('git', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const blob = inputGit(yaml, 'hash-object', '-w', '--stdin');
    let tree = inputGit(`100644 blob ${blob}\taction.yml\n`, 'mktree');
    for (const name of ['copilot-verification-setup', 'actions', '.github']) tree = inputGit(`040000 tree ${tree}\t${name}\n`, 'mktree');
    const commit = execFileSync('git', ['commit-tree', tree, '-m', 'Native setup fixture'], { encoding: 'utf8', env: { ...process.env,
        GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test' } }).trim();
    git('update-ref', 'refs/remotes/origin/copilot-native-fixture', commit);
    const setup = captureVerificationSetup(true, 'copilot-native-fixture');
    if (setup.kind !== 'ready') throw new Error('Native fixture snapshot was not captured');
    const candidateAction = join(process.cwd(), VERIFICATION_SETUP_DIRECTORY);
    const marker = join(process.cwd(), '.copilot-native-candidate');
    const testFile = join(process.cwd(), 'test_copilot_native_candidate.py');
    const requirements = join(process.cwd(), 'requirements-native-fixture.txt');
    const prerequisites = join(process.cwd(), '.copilot/verification-prerequisites.json');
    const originalPrerequisites = process.platform === 'linux' && existsSync(prerequisites) ? readFileSync(prerequisites) : undefined;
    const candidateYaml = 'runs:\n  using: composite\n  steps:\n    - run: exit 99\n      shell: bash\n';
    mkdirSync(candidateAction, { recursive: true });
    writeFileSync(join(candidateAction, 'action.yml'), candidateYaml);
    writeFileSync(marker, 'after-agent');
    writeFileSync(requirements, 'pytest==8.4.2\n');
    writeFileSync(testFile, [
        'import os,sys',
        'from pathlib import Path',
        'def test_candidate():',
        '    assert Path(".copilot-native-candidate").read_text() == "after-agent"',
        '    if sys.platform == "linux":',
        '        assert sys.version_info[:3] == (3,11,17)',
        '        library = Path(os.environ["LD_LIBRARY_PATH"]).resolve()',
        '        assert library.is_dir() and library.is_relative_to(Path(os.environ["RUNNER_TOOL_CACHE"]).resolve())',
        '        assert Path(sys.prefix).resolve() == Path(os.environ["HOME"]).resolve() / "venv"',
        '    assert "PAT" not in os.environ and "PYTHONHOME" not in os.environ and "PYTHONPATH" not in os.environ',
        '',
    ].join('\n'));
    const parentLibrary = process.env.LD_LIBRARY_PATH;
    const parentCredential = process.env.PAT;
    process.env.LD_LIBRARY_PATH = '/foreign-caller-library';
    process.env.PAT = 'fixture-parent-credential';
    try {
        if (process.platform === 'linux') {
            mkdirSync(join(process.cwd(), '.copilot'), { recursive: true });
            writeFileSync(prerequisites, JSON.stringify({ schemaVersion: 1, runtimes: { java: '17', node: '24', pnpm: '10', python: '3.11' } }));
        }
        const adapter = new GitCommitAdapter(undefined, undefined, setup);
        await adapter.execute('python', ['-m', 'pytest', '-q', testFile, '-p', 'no:cacheprovider'], { untrusted: true, verifyRuntimePrerequisites: true });
        if (process.env.LD_LIBRARY_PATH !== '/foreign-caller-library' || process.env.PAT !== 'fixture-parent-credential') {
            throw new Error('Verifier runtime state leaked into its parent Node environment');
        }
        core.info('Native Python acceptance passed: real private venv, configured pytest, filtered credential/loader options and unchanged parent Node environment.');
        await adapter.execute('pnpm', ['--version'], { untrusted: true, verifyRuntimePrerequisites: true });
        if (process.platform === 'linux') {
            const before = git('status', '--porcelain=v1', '--untracked-files=all');
            await adapter.execute(process.execPath, [join(process.cwd(), 'src/tooling/__tests__/fixtures/verification_jvm_gradle_probe.cjs')], {
                untrusted: true, verifyRuntimePrerequisites: true,
            });
            if (git('status', '--porcelain=v1', '--untracked-files=all') !== before) throw new Error('JVM/Gradle verifier changed candidate files');
            core.info('Native Linux JVM/Gradle acceptance passed: private homes/configuration, offline fresh Java compilation and JavaExec, candidate unchanged.');
        }
        if (readFileSync(VERIFICATION_SETUP_PATH, 'utf8') !== candidateYaml) throw new Error('Candidate action was not restored');
        writeFileSync(join(process.cwd(), '.github/actions/copilot-native-fixture/dist/index.js'), 'throw new Error("Candidate runtime must never execute during continuation or post");');
        core.info('Native composite acceptance passed: candidate manifests, trusted snapshot, Python/pytest and Node/pnpm, ' + (process.platform === 'linux' ? 'JVM/Gradle and three' : 'two') + ' fresh profiles.');
    } catch (error) {
        nativeRuntimeRejectionFacts(setup);
        // This controlled fixture contains no credentials. File names, rather than file contents,
        // identify dependency installers that unexpectedly alter the publishable candidate.
        core.info(`Native fixture candidate status: ${git('status', '--porcelain=v1').slice(0, 8_192)}`);
        core.info(`Native fixture tracked changes: ${git('diff', '--no-ext-diff', '--no-textconv', '--numstat', 'HEAD', '--').slice(0, 8_192)}`);
        throw error;
    } finally {
        if (parentLibrary === undefined) delete process.env.LD_LIBRARY_PATH;
        else process.env.LD_LIBRARY_PATH = parentLibrary;
        if (parentCredential === undefined) delete process.env.PAT;
        else process.env.PAT = parentCredential;
        if (process.platform === 'linux') {
            if (originalPrerequisites) writeFileSync(prerequisites, originalPrerequisites);
            else rmSync(prerequisites, { force: true });
        }
        rmSync(candidateAction, { recursive: true, force: true }); rmSync(marker, { force: true }); rmSync(testFile, { force: true }); rmSync(requirements, { force: true });
        rmSync(join(process.cwd(), '__pycache__'), { recursive: true, force: true });
        git('update-ref', '-d', 'refs/remotes/origin/copilot-native-fixture', commit);
    }
}

void runNativeVerificationEntry(async () => {
    try { await fixture(); }
    catch (error) { core.setFailed(error instanceof Error ? error.message : 'Native acceptance failed'); }
}).catch(error => core.setFailed(error instanceof Error ? error.message : 'Native continuation failed'));
