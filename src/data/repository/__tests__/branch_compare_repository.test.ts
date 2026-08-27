/**
 * Unit tests for BranchCompareRepository: getChanges, getSizeCategoryAndReason.
 */

import { OctokitBranchComparisonClientAdapter } from '../../../infrastructure/github/octokit_branch_adapters';
import { BranchCompareRepository } from '../branch_compare_repository';
import { Labels } from '../../model/labels';
import { SizeThresholds } from '../../model/size_thresholds';
import { SizeThreshold } from '../../model/size_threshold';

jest.mock('../../../utils/logger', () => ({
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

const mockCompareCommits = jest.fn();
jest.mock('@actions/github', () => ({
    getOctokit: () => ({
        rest: {
            repos: {
                compareCommits: (...args: unknown[]) => mockCompareCommits(...args),
            },
        },
    }),
}));

function makeSizeThresholds(): SizeThresholds {
    return new SizeThresholds(
        new SizeThreshold(10000, 500, 200),   // xxl
        new SizeThreshold(2000, 100, 80),      // xl
        new SizeThreshold(500, 50, 30),       // l
        new SizeThreshold(200, 25, 15),      // m
        new SizeThreshold(50, 10, 5),        // s
        new SizeThreshold(0, 0, 0),          // xs
    );
}

function makeLabels(): Labels {
    return new Labels(
        'launch', 'bug', 'bugfix', 'hotfix', 'enhancement', 'feature', 'release',
        'question', 'help', 'deploy', 'deployed', 'docs', 'documentation', 'chore', 'maintenance',
        'high', 'medium', 'low', 'none',
        'XXL', 'XL', 'L', 'M', 'S', 'XS',
    );
}

describe('BranchCompareRepository', () => {
    const repo = new BranchCompareRepository(new OctokitBranchComparisonClientAdapter());

    beforeEach(() => {
        mockCompareCommits.mockReset();
    });

    describe('getChanges', () => {
        it('returns comparison with heads refs when head and base are branch names', async () => {
            mockCompareCommits.mockResolvedValue({
                data: {
                    ahead_by: 2,
                    behind_by: 0,
                    total_commits: 2,
                    files: [
                        {
                            filename: 'a.ts',
                            status: 'modified',
                            additions: 10,
                            deletions: 2,
                            changes: 12,
                            blob_url: 'https://blob',
                            raw_url: 'https://raw',
                            contents_url: 'https://contents',
                            patch: 'diff',
                        },
                    ],
                    commits: [
                        {
                            sha: 'abc',
                            commit: {
                                message: 'msg',
                                author: { name: 'A', email: 'a@x.com', date: '2024-01-01' },
                            },
                        },
                    ],
                },
            });

            const result = await repo.getChanges('o', 'r', 'feature/1-foo', 'develop', 'token');

            expect(mockCompareCommits).toHaveBeenCalledWith({
                owner: 'o',
                repo: 'r',
                base: 'heads/develop',
                head: 'heads/feature/1-foo',
            });
            expect(result.aheadBy).toBe(2);
            expect(result.behindBy).toBe(0);
            expect(result.totalCommits).toBe(2);
            expect(result.files).toHaveLength(1);
            expect(result.files[0].filename).toBe('a.ts');
            expect(result.files[0].changes).toBe(12);
            expect(result.commits).toHaveLength(1);
            expect(result.commits[0].author.name).toBe('A');
        });

        it('uses tag ref when head contains tags/', async () => {
            mockCompareCommits.mockResolvedValue({
                data: {
                    ahead_by: 0,
                    behind_by: 0,
                    total_commits: 0,
                    files: [],
                    commits: [],
                },
            });

            await repo.getChanges('o', 'r', 'tags/v1.0', 'develop', 'token');

            expect(mockCompareCommits).toHaveBeenCalledWith(
                expect.objectContaining({
                    head: 'tags/v1.0',
                    base: 'heads/develop',
                }),
            );
        });

        it('maps missing file fields to 0 and author to defaults', async () => {
            mockCompareCommits.mockResolvedValue({
                data: {
                    ahead_by: 0,
                    behind_by: 0,
                    total_commits: 1,
                    files: [
                        {
                            filename: 'b.ts',
                            status: 'added',
                            blob_url: '',
                            raw_url: '',
                            contents_url: '',
                        },
                    ],
                    commits: [
                        {
                            sha: 'def',
                            commit: {
                                message: 'm',
                                author: undefined,
                            },
                        },
                    ],
                },
            });

            const result = await repo.getChanges('o', 'r', 'h', 'b', 'token');

            expect(result.files[0].additions).toBe(0);
            expect(result.files[0].deletions).toBe(0);
            expect(result.files[0].changes).toBe(0);
            expect(result.commits[0].author.name).toBe('Unknown');
            expect(result.commits[0].author.email).toBe('unknown@example.com');
        });

        it('throws and logs on compareCommits error', async () => {
            const { logError } = require('../../../utils/logger');
            mockCompareCommits.mockRejectedValue(new Error('API error'));

            await expect(repo.getChanges('o', 'r', 'h', 'b', 'token')).rejects.toThrow('API error');
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Error comparing branches'));
        });
    });

    describe('getSizeCategoryAndReason', () => {
        const sizeThresholds = makeSizeThresholds();
        const labels = makeLabels();

        it('returns XS for small changes', async () => {
            mockCompareCommits.mockResolvedValue({
                data: {
                    ahead_by: 1,
                    behind_by: 0,
                    total_commits: 1,
                    files: [
                        { filename: 'f', status: 'modified', additions: 5, deletions: 2, changes: 7, blob_url: '', raw_url: '', contents_url: '' },
                    ],
                    commits: [],
                },
            });

            const result = await repo.getSizeCategoryAndReason(
                'o', 'r', 'head', 'base', sizeThresholds, labels, 'token',
            );

            expect(result.size).toBe('XS');
            expect(result.githubSize).toBe('XS');
            expect(result.reason).toMatch(/Small changes/);
        });

        it('returns S when over s threshold by lines', async () => {
            mockCompareCommits.mockResolvedValue({
                data: {
                    ahead_by: 1,
                    behind_by: 0,
                    total_commits: 1,
                    files: [
                        { filename: 'f', status: 'modified', additions: 60, deletions: 0, changes: 60, blob_url: '', raw_url: '', contents_url: '' },
                    ],
                    commits: [],
                },
            });

            const result = await repo.getSizeCategoryAndReason(
                'o', 'r', 'head', 'base', sizeThresholds, labels, 'token',
            );

            expect(result.size).toBe('S');
            expect(result.githubSize).toBe('S');
            expect(result.reason).toContain('50 lines');
        });

        it('returns M when over m threshold', async () => {
            mockCompareCommits.mockResolvedValue({
                data: {
                    ahead_by: 5,
                    behind_by: 0,
                    total_commits: 5,
                    files: Array.from({ length: 30 }, (_, i) => ({
                        filename: `f${i}.ts`,
                        status: 'modified',
                        additions: 10,
                        deletions: 2,
                        changes: 12,
                        blob_url: '',
                        raw_url: '',
                        contents_url: '',
                    })),
                    commits: [],
                },
            });

            const result = await repo.getSizeCategoryAndReason(
                'o', 'r', 'head', 'base', sizeThresholds, labels, 'token',
            );

            expect(result.size).toBe('M');
            expect(result.githubSize).toBe('M');
        });

        it('returns L when over l threshold by commits', async () => {
            mockCompareCommits.mockResolvedValue({
                data: {
                    ahead_by: 40,
                    behind_by: 0,
                    total_commits: 40,
                    files: [{ filename: 'x', status: 'modified', additions: 1, deletions: 0, changes: 1, blob_url: '', raw_url: '', contents_url: '' }],
                    commits: [],
                },
            });

            const result = await repo.getSizeCategoryAndReason(
                'o', 'r', 'head', 'base', sizeThresholds, labels, 'token',
            );

            expect(result.size).toBe('L');
            expect(result.githubSize).toBe('L');
        });

        it('returns XL and XXL for higher thresholds', async () => {
            mockCompareCommits.mockResolvedValue({
                data: {
                    ahead_by: 3000,
                    behind_by: 0,
                    total_commits: 1,
                    files: [{ filename: 'x', status: 'modified', additions: 3000, deletions: 0, changes: 3000, blob_url: '', raw_url: '', contents_url: '' }],
                    commits: [],
                },
            });

            const result = await repo.getSizeCategoryAndReason(
                'o', 'r', 'head', 'base', sizeThresholds, labels, 'token',
            );

            expect(result.size).toBe('XL');
            expect(result.githubSize).toBe('XL');
        });

        it('throws and logs when getChanges fails', async () => {
            const { logError } = require('../../../utils/logger');
            mockCompareCommits.mockRejectedValue(new Error('compare failed'));

            await expect(
                repo.getSizeCategoryAndReason('o', 'r', 'head', 'base', sizeThresholds, labels, 'token'),
            ).rejects.toThrow('compare failed');
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Error comparing branches'));
        });
    });
});
