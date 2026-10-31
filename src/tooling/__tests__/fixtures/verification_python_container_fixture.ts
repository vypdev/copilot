/** Source-wired adapter/default-preflight acceptance, with a real dependency-preparation port. */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { GitCommitAdapter } from '../../../infrastructure/git_commit_adapter';
import { DISABLED_VERIFICATION_SETUP } from '../../../application/ports/verification_setup_ports';

async function fixture(): Promise<void> {
    const mode = process.argv[2];
    if (!['legacy', 'private'].includes(mode)) throw new Error('fixture-mode');
    const cache = realpathSync(process.env.RUNNER_TOOL_CACHE!);
    const prefix = realpathSync(process.env.COPILOT_FIXTURE_PYTHON_PREFIX!);
    const part = relative(cache, prefix);
    if (!part || part === '..' || part.startsWith('../') || isAbsolute(part)) throw new Error('fixture-cache');
    const python = join(prefix, 'bin/python3');
    const library = realpathSync(join(prefix, 'lib'));
    const kernel = spawnSync(python, ['--version'], { env: { HOME: '/tmp', PATH: '/usr/local/bin:/usr/bin:/bin' }, encoding: 'utf8' });
    if (kernel.status === 0 || !/error while loading shared libraries: libpython3\.11\.so\.1\.0:/u.test(kernel.stderr || '')) throw new Error('fixture-negative');
    const probe = readFileSync(join(dirname(process.argv[1]), 'verification_python_probe.cjs'));
    const owned = mkdtempSync('/tmp/copilot-python-candidate-');
    const original = process.cwd(); const parent = { ...process.env }; const profiles: string[] = [];
    const source = [
        'import os,sys,unittest',
        'from pathlib import Path',
        'class Runtime(unittest.TestCase):',
        ' def test_private_runtime(self):',
        '  self.assertEqual(sys.version_info[:3],(3,11,17))',
        '  self.assertEqual(Path(sys.prefix).resolve(),Path(os.environ["HOME"]).resolve()/"venv")',
        '  self.assertNotEqual(sys.prefix,sys.base_prefix)',
        '  self.assertEqual(Path("candidate.txt").read_text(),"unchanged")',
        '  for key in ("PAT","NODE_OPTIONS","PYTHONHOME","PYTHONPATH","LD_PRELOAD","LD_AUDIT"):',
        '   self.assertNotIn(key,os.environ)',
        '',
    ].join('\n');
    try {
        process.chdir(owned); mkdirSync('.copilot');
        writeFileSync('.copilot/verification-prerequisites.json', JSON.stringify({ schemaVersion: 1, runtimes: { python: '3.11' } }));
        writeFileSync('candidate.txt', 'unchanged'); writeFileSync('test_copilot_runtime.py', source); writeFileSync('verification_python_probe.cjs', probe);
        const paths = ['.copilot/verification-prerequisites.json', 'candidate.txt', 'test_copilot_runtime.py', 'verification_python_probe.cjs'];
        const digest = () => createHash('sha256').update(Buffer.concat(paths.map(file => readFileSync(file)))).digest('hex');
        const before = digest();
        process.env.PATH = join(prefix, 'bin') + ':/usr/local/bin:/usr/bin:/bin';
        process.env.LD_LIBRARY_PATH = '/foreign-caller-library'; process.env.PAT = 'fixture-parent-credential';
        process.env.NODE_OPTIONS = '--require /foreign-option'; process.env.PYTHONHOME = '/foreign-python';
        process.env.PYTHONPATH = '/foreign-imports'; process.env.LD_PRELOAD = '/foreign-preload'; process.env.LD_AUDIT = '/foreign-audit';
        for (const symlinks of [false, true]) {
            let prepared = false;
            const adapter = new GitCommitAdapter(undefined, undefined, DISABLED_VERIFICATION_SETUP, async environment => {
                prepared = true; profiles.push(environment.HOME);
                if (environment.LD_LIBRARY_PATH !== library) throw new Error('fixture-derived-library');
                const setup = spawnSync(python, ['-c', 'import sys,venv;venv.create(sys.argv[1],symlinks=sys.argv[2]=="true",with_pip=False)',
                    join(environment.HOME, 'venv'), String(symlinks)], { env: environment, encoding: 'utf8', timeout: 30_000 });
                if (setup.error || setup.status !== 0) throw new Error('fixture-bootstrap');
                environment.PATH = join(environment.HOME, 'venv/bin') + ':' + environment.PATH;
            });
            let blocked = false;
            try {
                const code = await adapter.execute(process.execPath, [join(owned, 'verification_python_probe.cjs')], { untrusted: true, verifyRuntimePrerequisites: true });
                if (code !== 0 || mode === 'legacy') throw new Error('fixture-unexpected-verdict');
            } catch (error) {
                if (mode !== 'legacy' || !(error instanceof Error) || error.name !== 'VerificationPrerequisiteError'
                    || !error.message.includes('Python 3.11 is unavailable') || prepared) throw error;
                blocked = true;
            }
            if (digest() !== before || profiles.some(profile => existsSync(profile))) throw new Error('fixture-source-or-cleanup');
            if (process.env.LD_LIBRARY_PATH !== '/foreign-caller-library' || process.env.PAT !== 'fixture-parent-credential') throw new Error('fixture-parent');
            console.log(JSON.stringify({ fixture: 'source-python-loader', mode, venv: symlinks ? 'symlinks' : 'copies',
                actualLoaderFailureReproduced: true, preflightBlocked: blocked, actualVerifierCompleted: !blocked,
                sourceUnchanged: true, parentNodeUnchanged: true, profileCleanup: true }));
        }
        if (mode === 'private' && new Set(profiles).size !== 2) throw new Error('fixture-freshness');
        if (readdirSync('/tmp').some(name => name.startsWith('copilot-verify-runtime-'))) throw new Error('fixture-profile-leak');
    } finally { process.chdir(original); process.env = parent; rmSync(owned, { recursive: true, force: true }); }
}

void fixture().catch(error => {
    console.error('PYTHON_FIXTURE_FAILURE:' + (error instanceof Error && error.name === 'VerificationPrerequisiteError' ? 'prerequisite-unavailable' : 'runtime'));
    process.exitCode = 1;
});
