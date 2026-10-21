import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { VerificationSetupError } from '../application/policies/verification_setup_policy';

/** Bind setup to the exact HEAD, branch, index, tracked edits and publishable untracked files. */
export function verificationCandidateIdentity(workspace: string, environment: Record<string, string>): string {
    const hash = createHash('sha256');
    const git = (...args: string[]): Buffer => {
        const result = spawnSync('git', ['--no-replace-objects', ...args], { cwd: workspace, env: environment, shell: false,
            windowsHide: true, timeout: 10_000, maxBuffer: 16 * 1024 * 1024 });
        if (result.error || result.status !== 0) throw new VerificationSetupError('candidate-changed');
        hash.update(result.stdout).update('\0');
        return result.stdout;
    };
    git('rev-parse', '--verify', 'HEAD');
    git('rev-parse', '--symbolic-full-name', 'HEAD');
    git('ls-files', '--stage', '-z');
    git('diff', '--no-ext-diff', '--no-textconv', '--binary', 'HEAD', '--');
    const paths = git('ls-files', '--others', '--exclude-standard', '-z').toString('utf8').split('\0').filter(Boolean);
    let total = 0;
    if (paths.length > 256) throw new VerificationSetupError('candidate-changed');
    for (const path of paths) {
        const file = join(workspace, path);
        const stat = lstatSync(file);
        total += stat.size;
        if (total > 16 * 1024 * 1024) throw new VerificationSetupError('candidate-changed');
        hash.update(path).update('\0');
        if (stat.isSymbolicLink()) hash.update('120000\0').update(readlinkSync(file));
        else if (stat.isFile()) hash.update(stat.mode & 0o100 ? '100755\0' : '100644\0').update(readFileSync(file));
        else throw new VerificationSetupError('candidate-changed');
        hash.update('\0');
    }
    return hash.digest('hex');
}
