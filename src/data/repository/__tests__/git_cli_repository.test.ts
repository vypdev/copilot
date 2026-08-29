/**
 * Unit tests for GitCliRepository: fetchRemoteBranches, getLatestTag, getCommitTag.
 */

import { GitCliRepository } from '../git_cli_repository';

jest.mock('../../../utils/logger', () => ({
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

const mockExec = jest.fn();
jest.mock('@actions/exec', () => ({
    exec: (...args: unknown[]) => mockExec(...args),
}));

jest.mock('../../model/version_policy', () => ({
    getLatestVersion: (tags: string[]) => (tags.length > 0 ? tags[0] : undefined),
}));

describe('GitCliRepository', () => {
    const repo = new GitCliRepository();

    beforeEach(() => {
        mockExec.mockReset();
    });

    describe('fetchRemoteBranches', () => {
        it('runs fetch --tags --force and fetch --all -v', async () => {
            mockExec.mockResolvedValue(0);

            await repo.fetchRemoteBranches();

            expect(mockExec).toHaveBeenCalledTimes(2);
            expect(mockExec).toHaveBeenNthCalledWith(1, 'git', ['fetch', '--tags', '--force']);
            expect(mockExec).toHaveBeenNthCalledWith(2, 'git', ['fetch', '--all', '-v']);
        });

        it('rejects on error so the application layer can decide the failure policy', async () => {
            mockExec.mockRejectedValue(new Error('git failed'));

            await expect(repo.fetchRemoteBranches()).rejects.toThrow('git failed');
        });
    });

    describe('getLatestTag', () => {
        it('returns latest valid semver tag', async () => {
            mockExec
                .mockResolvedValueOnce(0)
                .mockImplementationOnce((_cmd: string, _args: string[], opts: { listeners?: { stdout: (d: Buffer) => void } }) => {
                    const stdout = opts?.listeners?.stdout;
                    if (stdout) {
                        stdout(Buffer.from('2.0.0\n1.9.0\n1.0.0\n'));
                    }
                    return Promise.resolve(0);
                });

            const result = await repo.getLatestTag();

            expect(mockExec).toHaveBeenCalledWith('git', ['fetch', '--tags']);
            expect(mockExec).toHaveBeenCalledWith('git', ['tag', '--sort=-creatordate'], expect.any(Object));
            expect(result).toBe('2.0.0');
        });

        it('strips leading v from tags when parsing', async () => {
            mockExec
                .mockResolvedValueOnce(0)
                .mockImplementationOnce((_cmd: string, _args: string[], opts: { listeners?: { stdout: (d: Buffer) => void } }) => {
                    const stdout = opts?.listeners?.stdout;
                    if (stdout) stdout(Buffer.from('v1.0.0\n'));
                    return Promise.resolve(0);
                });

            await repo.getLatestTag();

            expect(mockExec).toHaveBeenCalledTimes(2);
        });

        it('returns undefined when no valid tags', async () => {
            mockExec
                .mockResolvedValueOnce(0)
                .mockImplementationOnce((_cmd: string, _args: string[], opts: { listeners?: { stdout: (d: Buffer) => void } }) => {
                    const stdout = opts?.listeners?.stdout;
                    if (stdout) stdout(Buffer.from('not-semver\n'));
                    return Promise.resolve(0);
                });

            const result = await repo.getLatestTag();

            expect(result).toBeUndefined();
        });

        it('rejects on error so callers can preserve the failure', async () => {
            mockExec.mockRejectedValue(new Error('fetch failed'));

            await expect(repo.getLatestTag()).rejects.toThrow('fetch failed');
        });
    });

    describe('getCommitTag', () => {
        it('rejects when latestTag is undefined', async () => {
            const result = repo.getCommitTag(undefined);

            await expect(result).rejects.toThrow('No LATEST_TAG found in the environment');
            expect(mockExec).not.toHaveBeenCalled();
        });

        it('uses tag as-is when it starts with v', async () => {
            mockExec.mockImplementation((cmd: string, args: string[], opts: { listeners?: { stdout: (d: Buffer) => void } }) => {
                if (args?.[0] === 'rev-list' && opts?.listeners?.stdout) {
                    opts.listeners.stdout(Buffer.from('abc123'));
                }
                return Promise.resolve(0);
            });

            const result = await repo.getCommitTag('v1.0.0');

            expect(mockExec).toHaveBeenCalledWith('git', ['rev-list', '-n', '1', 'v1.0.0'], expect.any(Object));
            expect(result).toBe('abc123');
        });

        it('prepends v when tag does not start with v', async () => {
            mockExec.mockImplementation((_cmd: string, args: string[], opts: { listeners?: { stdout: (d: Buffer) => void } }) => {
                if (opts?.listeners?.stdout) opts.listeners.stdout(Buffer.from('oid456'));
                return Promise.resolve(0);
            });

            const result = await repo.getCommitTag('1.0.0');

            expect(mockExec).toHaveBeenCalledWith('git', ['rev-list', '-n', '1', 'v1.0.0'], expect.any(Object));
            expect(result).toBe('oid456');
        });

        it('rejects when rev-list returns empty oid', async () => {
            mockExec.mockImplementation((_cmd: string, _args: string[], opts: { listeners?: { stdout: (d: Buffer) => void } }) => {
                if (opts?.listeners?.stdout) opts.listeners.stdout(Buffer.from(''));
                return Promise.resolve(0);
            });

            const result = repo.getCommitTag('v1.0.0');

            await expect(result).rejects.toThrow('No commit found for the tag');
        });

        it('rejects on exec error', async () => {
            mockExec.mockRejectedValue(new Error('rev-list failed'));

            await expect(repo.getCommitTag('v1.0.0')).rejects.toThrow('rev-list failed');
        });
    });
});
