/** Native CI acceptance: the real Actions runner executes the reviewed YAML between candidate and verifier. */
import * as core from '@actions/core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNativeVerificationEntry } from '../../../infrastructure/native_verification_controller';
import { captureVerificationSetup } from '../../../infrastructure/verification_setup_snapshot';
import { GitCommitAdapter } from '../../../infrastructure/git_commit_adapter';
import { VERIFICATION_SETUP_DIRECTORY, VERIFICATION_SETUP_PATH } from '../../../application/policies/verification_setup_policy';

const yaml = `name: Native setup acceptance
runs:
  using: composite
  steps:
    - uses: actions/setup-python@v6
      with:
        python-version: '3.12'
    - uses: pnpm/action-setup@v5
      with:
        version: 10.12.4
        dest: \${{ env.HOME }}/native-pnpm
        standalone: false
    - name: Install candidate test dependencies privately
      run: |
        python - <<'PYTHON'
        import os, pathlib, subprocess, venv
        home = pathlib.Path(os.environ['HOME']) / 'venv'
        venv.create(home, with_pip=True)
        tools = home / ('Scripts' if os.name == 'nt' else 'bin')
        python = tools / ('python.exe' if os.name == 'nt' else 'python')
        subprocess.check_call([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements-native-fixture.txt'])
        with open(os.environ['GITHUB_PATH'], 'a') as paths:
            print(tools, file=paths)
        PYTHON
      shell: bash
    - run: python -c "from pathlib import Path; assert Path('.copilot-native-candidate').read_text() == 'after-agent'"
      shell: bash
`;

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
    const candidateYaml = 'runs:\n  using: composite\n  steps:\n    - run: exit 99\n      shell: bash\n';
    mkdirSync(candidateAction, { recursive: true });
    writeFileSync(join(candidateAction, 'action.yml'), candidateYaml);
    writeFileSync(marker, 'after-agent');
    writeFileSync(requirements, 'pytest==8.4.2\n');
    writeFileSync(testFile, 'from pathlib import Path\ndef test_candidate():\n    assert Path(".copilot-native-candidate").read_text() == "after-agent"\n');
    try {
        const adapter = new GitCommitAdapter(undefined, undefined, setup);
        await adapter.execute('python', ['-m', 'pytest', '-q', testFile, '-p', 'no:cacheprovider'], { untrusted: true, verifyRuntimePrerequisites: true });
        await adapter.execute('pnpm', ['--version'], { untrusted: true, verifyRuntimePrerequisites: true });
        if (readFileSync(VERIFICATION_SETUP_PATH, 'utf8') !== candidateYaml) throw new Error('Candidate action was not restored');
        core.info('Native composite acceptance passed: candidate manifests, trusted snapshot, Python/pytest and Node/pnpm, two fresh profiles.');
    } finally {
        rmSync(candidateAction, { recursive: true, force: true }); rmSync(marker, { force: true }); rmSync(testFile, { force: true }); rmSync(requirements, { force: true });
        rmSync(join(process.cwd(), '__pycache__'), { recursive: true, force: true });
        git('update-ref', '-d', 'refs/remotes/origin/copilot-native-fixture', commit);
    }
}

void runNativeVerificationEntry(async () => {
    try { await fixture(); }
    catch (error) { core.setFailed(error instanceof Error ? error.message : 'Native acceptance failed'); }
}).catch(error => core.setFailed(error instanceof Error ? error.message : 'Native continuation failed'));
