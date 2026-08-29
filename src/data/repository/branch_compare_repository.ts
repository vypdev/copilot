import type { GithubBranchComparisonClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import { logDebugInfo, logError } from '../../utils/logger';
import { Labels } from '../model/labels';
import { SizeThresholds } from '../model/size_thresholds';
import { classifyChangeSize } from './branch_change_size_policy';
import type { SizeCategoryResult } from './branch_change_size_policy';

export interface BranchComparisonFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    blobUrl: string;
    rawUrl: string;
    contentsUrl: string;
    patch: string | undefined;
}

export interface BranchComparisonCommit {
    sha: string;
    message: string;
    author: { name: string; email: string; date: string };
    date: string;
}

export interface BranchComparison {
    aheadBy: number;
    behindBy: number;
    totalCommits: number;
    files: BranchComparisonFile[];
    commits: BranchComparisonCommit[];
}

/**
 * Repository for comparing branches and computing size categories.
 * Isolated to allow unit tests with mocked Octokit and pure size logic.
 */
export class BranchCompareRepository {
    constructor(private readonly githubClient: GithubClientPort<GithubBranchComparisonClient>) {}

    getChanges = async (
        owner: string,
        repository: string,
        head: string,
        base: string,
        token: string,
    ): Promise<BranchComparison> => {
        try {
            const octokit = this.githubClient.getClient(token);

            logDebugInfo(`Comparing branches: ${head} with ${base}`);

        let headRef = `heads/${head}`;
        if (head.indexOf('tags/') > -1) {
            headRef = head;
        }

        let baseRef = `heads/${base}`;
        if (base.indexOf('tags/') > -1) {
            baseRef = base;
        }

        const { data: comparison } = await octokit.rest.repos.compareCommits({
            owner: owner,
            repo: repository,
            base: baseRef,
            head: headRef,
        });

        return {
            aheadBy: comparison.ahead_by,
            behindBy: comparison.behind_by,
            totalCommits: comparison.total_commits,
            files: (comparison.files || []).map(file => ({
                filename: file.filename,
                status: file.status,
                additions: file.additions ?? 0,
                deletions: file.deletions ?? 0,
                changes: file.changes ?? 0,
                blobUrl: file.blob_url,
                rawUrl: file.raw_url,
                contentsUrl: file.contents_url,
                patch: file.patch,
            })),
            commits: comparison.commits.map(commit => {
                const author = commit.commit.author;
                return {
                    sha: commit.sha,
                    message: commit.commit.message,
                    author: {
                        name: author?.name ?? 'Unknown',
                        email: author?.email ?? 'unknown@example.com',
                        date: author?.date ?? new Date().toISOString(),
                    },
                    date: author?.date ?? new Date().toISOString(),
                };
            }),
        };
        } catch (error) {
            logError(`Error comparing branches: ${error}`);
            throw error;
        }
    };

    getSizeCategoryAndReason = async (
        owner: string,
        repository: string,
        head: string,
        base: string,
        sizeThresholds: SizeThresholds,
        labels: Labels,
        token: string,
    ): Promise<SizeCategoryResult> => {
        try {
            const headBranchChanges = await this.getChanges(
                owner,
                repository,
                head,
                base,
                token,
            );

            return classifyChangeSize({
                totalChanges: headBranchChanges.files.reduce((sum, file) => sum + file.changes, 0),
                totalFiles: headBranchChanges.files.length,
                totalCommits: headBranchChanges.totalCommits,
            }, sizeThresholds, labels);
        } catch (error) {
            logError(`Error comparing branches: ${error}`);
            throw error;
        }
    };
}
