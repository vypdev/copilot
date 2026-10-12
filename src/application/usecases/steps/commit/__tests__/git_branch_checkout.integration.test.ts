import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkoutBranch, type BranchCheckoutPort } from '../git_branch_checkout';

jest.mock('../../../../ports/logging_ports', () => ({ logInfo: jest.fn(), logDebugInfo: jest.fn(), logError: jest.fn() }));

function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'copilot-checkout-proof-'));
    const origin = join(root, 'origin.git');
    const local = join(root, 'local');
    const contributor = join(root, 'contributor');
    const hooks = join(root, 'empty-hooks');
    mkdirSync(hooks);
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', `core.hooksPath=${hooks}`, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git(root, 'init', '--bare', origin);
    git(root, 'clone', origin, local);
    git(local, 'config', 'user.name', 'Fixture');
    git(local, 'config', 'user.email', 'fixture@example.invalid');
    git(local, 'checkout', '-b', 'feature/42-proof');
    const commit = (cwd: string, text: string) => {
        writeFileSync(join(cwd, 'evidence.txt'), text);
        git(cwd, 'add', 'evidence.txt');
        git(cwd, 'commit', '-m', 'fixture');
        return git(cwd, 'rev-parse', 'HEAD');
    };
    const initial = commit(local, 'initial');
    git(local, 'push', 'origin', 'feature/42-proof');
    git(root, 'clone', '--branch', 'feature/42-proof', origin, contributor);
    git(contributor, 'config', 'user.name', 'Fixture');
    git(contributor, 'config', 'user.email', 'fixture@example.invalid');
    const port: BranchCheckoutPort = {
        fetch: async branch => { git(local, 'fetch', 'origin', branch); },
        execute: async (program, args, options) => {
            const result = spawnSync(program, ['-c', `core.hooksPath=${hooks}`, ...args], { cwd: local, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
            if (result.error) throw result.error;
            options?.stdout?.(result.stdout);
            return result.status ?? 1;
        },
    };
    return { root, local, contributor, git, commit, initial, port };
}

describe('verified remote branch checkout', () => {
    it('fast-forwards a retained stale local branch to the exact newly fetched remote commit', async () => {
        const f = fixture();
        try {
            const remote = f.commit(f.contributor, 'remote update');
            f.git(f.contributor, 'push', 'origin', 'feature/42-proof');
            expect(f.git(f.local, 'rev-parse', 'HEAD')).toBe(f.initial);
            expect(await checkoutBranch('feature/42-proof', f.port)).toBe(true);
            expect(f.git(f.local, 'rev-parse', 'HEAD')).toBe(remote);
            expect(readFileSync(join(f.local, 'evidence.txt'), 'utf8')).toBe('remote update');
        } finally { rmSync(f.root, { recursive: true, force: true }); }
    });

    it('refuses an unpublished local commit without resetting or deleting it', async () => {
        const f = fixture();
        try {
            const unpublished = f.commit(f.local, 'unpublished');
            expect(await checkoutBranch('feature/42-proof', f.port)).toBe(false);
            expect(f.git(f.local, 'rev-parse', 'HEAD')).toBe(unpublished);
            expect(readFileSync(join(f.local, 'evidence.txt'), 'utf8')).toBe('unpublished');
        } finally { rmSync(f.root, { recursive: true, force: true }); }
    });

    it('refuses divergent remote and local commits without a merge commit or discarding local work', async () => {
        const f = fixture();
        try {
            const local = f.commit(f.local, 'local divergence');
            f.commit(f.contributor, 'remote divergence');
            f.git(f.contributor, 'push', 'origin', 'feature/42-proof');
            expect(await checkoutBranch('feature/42-proof', f.port)).toBe(false);
            expect(f.git(f.local, 'rev-parse', 'HEAD')).toBe(local);
            expect(f.git(f.local, 'status', '--porcelain')).toBe('');
        } finally { rmSync(f.root, { recursive: true, force: true }); }
    });

    it.each(['status', 'checkout', 'stash-push', 'stash-pop', 'merge', 'merge-base'])('rejects nonzero %s without reporting branch preparation success', async failed => {
        const port: BranchCheckoutPort = {
            fetch: jest.fn().mockResolvedValue(undefined),
            execute: jest.fn(async (_program, args, options) => {
                const step = args[0] === 'stash' ? `stash-${args[1]}` : args[0];
                if (args[0] === 'status' && failed.startsWith('stash-')) options?.stdout?.(Buffer.from(' M file.txt\n'));
                return step === failed ? 1 : 0;
            }),
        };
        expect(await checkoutBranch('feature/42-proof', port)).toBe(false);
        if (failed === 'status' || failed === 'stash-push') expect(port.fetch).not.toHaveBeenCalled();
    });
});
