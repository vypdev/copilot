/**
 * Unit tests for MergeRepository.mergeBranch: PR creation, waiting for checks per PR,
 * fallback when the PR has no check runs, timeout, and the limited direct merge fallback.
 *
 * Used by the deploy flow (release/hotfix → default and develop). See docs/single-actions/deploy-label-and-merge.mdx.
 */

import { OctokitBranchMergeClientAdapter } from '../../../infrastructure/github/octokit_branch_adapters';
import { MergeRepository } from '../merge_repository';

jest.mock('../../../utils/logger', () => ({
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

const mockPullsCreate = jest.fn();
const mockPullsListCommits = jest.fn();
const mockPullsUpdate = jest.fn();
const mockPullsMerge = jest.fn();
const mockReposMerge = jest.fn();
const mockChecksListForRef = jest.fn();
const mockReposGetCombinedStatusForRef = jest.fn();

jest.mock('@actions/github', () => ({
    getOctokit: () => ({
        rest: {
            pulls: {
                create: (...args: unknown[]) => mockPullsCreate(...args),
                listCommits: (...args: unknown[]) => mockPullsListCommits(...args),
                update: (...args: unknown[]) => mockPullsUpdate(...args),
                merge: (...args: unknown[]) => mockPullsMerge(...args),
            },
            repos: {
                merge: (...args: unknown[]) => mockReposMerge(...args),
                getCombinedStatusForRef: (...args: unknown[]) => mockReposGetCombinedStatusForRef(...args),
            },
            checks: {
                listForRef: (...args: unknown[]) => mockChecksListForRef(...args),
            },
        },
    }),
}));

describe('MergeRepository', () => {
    const repo = new MergeRepository(new OctokitBranchMergeClientAdapter());

    beforeEach(() => {
        mockPullsCreate.mockReset();
        mockPullsListCommits.mockReset();
        mockPullsUpdate.mockReset();
        mockPullsMerge.mockReset();
        mockReposMerge.mockReset();
        mockChecksListForRef.mockReset();
        mockReposGetCombinedStatusForRef.mockReset();
    });

    describe('PR creation and merge', () => {
        it('checks branch protection before merging even with a short timeout', async () => {
        mockPullsCreate.mockResolvedValue({
            data: { number: 42 },
        });
        mockPullsListCommits.mockResolvedValue({
            data: [{ commit: { message: 'fix: thing' } }],
        });
        mockPullsUpdate.mockResolvedValue({});
        mockChecksListForRef.mockResolvedValue({ data: { check_runs: [] } });
        mockReposGetCombinedStatusForRef.mockResolvedValue({
            data: { state: 'success', statuses: [] },
        });
        mockPullsMerge.mockResolvedValue({ data: { merged: true } });

        const result = await repo.mergeBranch(
            'owner',
            'repo',
            'feature/1-foo',
            'develop',
            5,
            'token',
        );

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(result[0].steps).toContainEqual(expect.stringContaining('was merged into'));
        expect(mockPullsCreate).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            head: 'feature/1-foo',
            base: 'develop',
            title: expect.any(String),
            body: expect.any(String),
        });
        expect(mockPullsListCommits).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            pull_number: 42,
        });
        expect(mockPullsMerge).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            pull_number: 42,
            merge_method: 'merge',
            commit_title: expect.any(String),
        });
        });

        it('on PR create failure uses the direct compatibility fallback', async () => {
        mockPullsCreate.mockRejectedValue(new Error('PR create failed'));
        mockReposMerge.mockResolvedValue({ data: { merged: true } });

        const result = await repo.mergeBranch(
            'o',
            'r',
            'head',
            'base',
            0,
            'token',
        );

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(result[0].steps).toContainEqual(expect.stringContaining('using direct merge'));
        expect(mockReposMerge).toHaveBeenCalledWith({
            owner: 'o',
            repo: 'r',
            base: 'base',
            head: 'head',
            commit_message: expect.any(String),
        });
        });

        it('on PR failure and direct merge failure preserves both errors', async () => {
        mockPullsCreate.mockRejectedValue(new Error('PR failed'));
        mockReposMerge.mockRejectedValue(new Error('Direct merge failed'));

        const result = await repo.mergeBranch(
            'o',
            'r',
            'head',
            'base',
            0,
            'token',
        );

        expect(result.length).toBe(1);
        expect(result.some(r => r.success === false && r.steps?.some(s => s.includes('Failed to merge')))).toBe(true);
        expect(result[0].errors.map(error => error.message)).toEqual(['PR failed', 'Direct merge failed']);
        });
    });

    describe('waiting for checks: per-PR check runs, no checks, timeout', () => {
        it('waits for check runs (all completed) then merges', async () => {
        mockPullsCreate.mockResolvedValue({ data: { number: 1 } });
        mockPullsListCommits.mockResolvedValue({ data: [{ commit: { message: 'msg' } }] });
        mockPullsUpdate.mockResolvedValue({});
        mockPullsMerge.mockResolvedValue({ data: { merged: true } });
        mockChecksListForRef.mockResolvedValue({
            data: {
                check_runs: [
                    { name: 'ci', status: 'completed', conclusion: 'success', pull_requests: [{ number: 1 }] },
                ],
            },
        });
        mockReposGetCombinedStatusForRef.mockResolvedValue({
            data: { state: 'success', statuses: [] },
        });

        const result = await repo.mergeBranch(
            'owner',
            'repo',
            'feature/1-x',
            'develop',
            30,
            'token',
        );

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(mockChecksListForRef).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            ref: 'feature/1-x',
        });
        expect(mockPullsMerge).toHaveBeenCalled();
        });

        it('fails closed when check runs have failed without direct merge', async () => {
        mockPullsCreate.mockResolvedValue({ data: { number: 1 } });
        mockPullsListCommits.mockResolvedValue({ data: [] });
        mockPullsUpdate.mockResolvedValue({});
        mockChecksListForRef.mockResolvedValue({
            data: {
                check_runs: [
                    { name: 'ci', status: 'completed', conclusion: 'failure', pull_requests: [{ number: 1 }] },
                ],
            },
        });
        mockReposGetCombinedStatusForRef.mockResolvedValue({
            data: { state: 'success', statuses: [] },
        });

        const result = await repo.mergeBranch('o', 'r', 'head', 'base', 30, 'token');

        expect(result.some(r => r.success === false && r.steps?.some(s => s.includes('Failed to merge')))).toBe(true);
        expect(result[0].errors[0].message).toContain('Checks did not pass');
        expect(mockReposMerge).not.toHaveBeenCalled();
        });

        it('uses completed status checks when no check runs exist', async () => {
        mockPullsCreate.mockResolvedValue({ data: { number: 1 } });
        mockPullsListCommits.mockResolvedValue({ data: [] });
        mockPullsUpdate.mockResolvedValue({});
        mockChecksListForRef.mockResolvedValue({
            data: { check_runs: [] },
        });
        mockReposGetCombinedStatusForRef.mockResolvedValue({
            data: { state: 'success', statuses: [{ context: 'ci', state: 'success' }] },
        });
        mockPullsMerge.mockResolvedValue({ data: { merged: true } });

        const result = await repo.mergeBranch(
            'o', 'r', 'head', 'base', 30, 'token',
        );

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(mockReposGetCombinedStatusForRef).toHaveBeenCalled();
        });

        it('waits only for check runs tied to this PR', async () => {
        jest.useFakeTimers();
        mockPullsCreate.mockResolvedValue({ data: { number: 42 } });
        mockPullsListCommits.mockResolvedValue({ data: [{ commit: { message: 'msg' } }] });
        mockPullsUpdate.mockResolvedValue({});
        mockPullsMerge.mockResolvedValue({ data: { merged: true } });
        // First poll: runs exist but for another PR (e.g. release→master already merged). We must not treat as completed.
        mockChecksListForRef
            .mockResolvedValueOnce({
                data: {
                    check_runs: [
                        { name: 'ci', status: 'completed', conclusion: 'success', pull_requests: [{ number: 1 }] },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: {
                    check_runs: [
                        { name: 'ci', status: 'completed', conclusion: 'success', pull_requests: [{ number: 42 }] },
                    ],
                },
            });
        mockReposGetCombinedStatusForRef.mockResolvedValue({
            data: { state: 'success', statuses: [] },
        });

        const promise = repo.mergeBranch(
            'owner',
            'repo',
            'release/1.0',
            'develop',
            30,
            'token',
        );
        await jest.runAllTimersAsync();
        const result = await promise;

        jest.useRealTimers();
        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(mockChecksListForRef).toHaveBeenCalledTimes(2);
        expect(mockPullsMerge).toHaveBeenCalled();
        });

        it('uses the combined status when no check run is linked to this PR', async () => {
        jest.useFakeTimers();
        mockPullsCreate.mockResolvedValue({ data: { number: 99 } });
        mockPullsListCommits.mockResolvedValue({ data: [] });
        mockPullsUpdate.mockResolvedValue({});
        mockPullsMerge.mockResolvedValue({ data: { merged: true } });
        // Check runs on ref are for another PR only; this PR (99) has none (e.g. develop has no required checks).
        mockChecksListForRef.mockResolvedValue({
            data: {
                check_runs: [
                    { name: 'ci', status: 'completed', conclusion: 'success', pull_requests: [{ number: 1 }] },
                ],
            },
        });
        mockReposGetCombinedStatusForRef.mockResolvedValue({
            data: { state: 'success', statuses: [] },
        });

        const promise = repo.mergeBranch('o', 'r', 'release/1.0', 'develop', 60, 'token');
        await jest.runAllTimersAsync();
        const result = await promise;

        jest.useRealTimers();
        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(mockChecksListForRef).toHaveBeenCalledTimes(3);
        expect(mockPullsMerge).toHaveBeenCalled();
        });

        it('waits for status checks when no check run is linked to this PR', async () => {
        jest.useFakeTimers();
        mockPullsCreate.mockResolvedValue({ data: { number: 99 } });
        mockPullsListCommits.mockResolvedValue({ data: [] });
        mockPullsUpdate.mockResolvedValue({});
        mockPullsMerge.mockResolvedValue({ data: { merged: true } });
        // Check runs on ref are for another PR only; this PR (99) has none.
        mockChecksListForRef.mockResolvedValue({
            data: {
                check_runs: [
                    { name: 'ci', status: 'completed', conclusion: 'success', pull_requests: [{ number: 1 }] },
                ],
            },
        });
        // First 4 polls: pending status check; 5th: completed so we proceed to merge.
        mockReposGetCombinedStatusForRef
            .mockResolvedValueOnce({
                data: { state: 'pending', statuses: [{ context: 'ci', state: 'pending' }] },
            })
            .mockResolvedValueOnce({
                data: { state: 'pending', statuses: [{ context: 'ci', state: 'pending' }] },
            })
            .mockResolvedValueOnce({
                data: { state: 'pending', statuses: [{ context: 'ci', state: 'pending' }] },
            })
            .mockResolvedValueOnce({
                data: { state: 'pending', statuses: [{ context: 'ci', state: 'pending' }] },
            })
            .mockResolvedValue({
                data: { state: 'success', statuses: [{ context: 'ci', state: 'success' }] },
            });

        const promise = repo.mergeBranch('o', 'r', 'release/1.0', 'develop', 60, 'token');
        await jest.runAllTimersAsync();
        const result = await promise;

        jest.useRealTimers();
        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(mockReposGetCombinedStatusForRef).toHaveBeenCalled();
        expect(mockPullsMerge).toHaveBeenCalled();
        });

        it('fails closed when checks never complete without direct merge', async () => {
        jest.useFakeTimers();
        mockPullsCreate.mockResolvedValue({ data: { number: 1 } });
        mockPullsListCommits.mockResolvedValue({ data: [] });
        mockPullsUpdate.mockResolvedValue({});
        mockChecksListForRef.mockResolvedValue({
            data: {
                check_runs: [{ name: 'ci', status: 'in_progress', conclusion: null, pull_requests: [{ number: 1 }] }],
            },
        });
        mockReposGetCombinedStatusForRef.mockResolvedValue({
            data: { state: 'pending', statuses: [] },
        });

        const promise = repo.mergeBranch('o', 'r', 'head', 'base', 30, 'token');
        await jest.runAllTimersAsync();
        const result = await promise;

        jest.useRealTimers();
        expect(result.some(r => r.success === false && r.steps?.some(s => s.includes('Failed to merge')))).toBe(true);
        expect(result[0].errors[0].message).toContain('Timed out waiting for checks');
        expect(mockReposMerge).not.toHaveBeenCalled();
        });

        it('blocks a failed combined status when no check run is linked to the PR', async () => {
        mockPullsCreate.mockResolvedValue({ data: { number: 1 } });
        mockPullsListCommits.mockResolvedValue({ data: [] });
        mockPullsUpdate.mockResolvedValue({});
        mockChecksListForRef.mockResolvedValue({ data: { check_runs: [] } });
        mockReposGetCombinedStatusForRef.mockResolvedValue({
            data: { state: 'failure', statuses: [{ context: 'ci', state: 'failure' }] },
        });

        const result = await repo.mergeBranch('o', 'r', 'head', 'base', 30, 'token');

        expect(result[0].success).toBe(false);
        expect(result[0].errors[0].message).toContain('Status checks did not pass');
        expect(mockPullsMerge).not.toHaveBeenCalled();
        expect(mockReposMerge).not.toHaveBeenCalled();
        });

        it('does not report success when GitHub declines the pull request merge', async () => {
        mockPullsCreate.mockResolvedValue({ data: { number: 1 } });
        mockPullsListCommits.mockResolvedValue({ data: [] });
        mockPullsUpdate.mockResolvedValue({});
        mockChecksListForRef.mockResolvedValue({ data: { check_runs: [] } });
        mockReposGetCombinedStatusForRef.mockResolvedValue({
            data: { state: 'success', statuses: [] },
        });
        mockPullsMerge.mockResolvedValue({ data: { merged: false, message: 'Branch is out of date' } });

        const result = await repo.mergeBranch('o', 'r', 'head', 'base', 0, 'token');

        expect(result[0].success).toBe(false);
        expect(result[0].errors[0].message).toContain('Branch is out of date');
        expect(mockReposMerge).not.toHaveBeenCalled();
        });
    });
});
