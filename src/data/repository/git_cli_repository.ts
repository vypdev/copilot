import * as exec from '@actions/exec';
import { logDebugInfo, logError } from '../../utils/logger';
import { getLatestVersion } from '../model/version_policy';
import { buildGitAuthenticationEnvironment } from '../../infrastructure/git_authentication_environment';
import { toApplicationError } from '../../application/errors/application_error';

/**
 * Repository for Git operations executed via CLI (exec).
 * Isolated to allow unit tests with mocked @actions/exec.
 */
export class GitCliRepository {

    constructor(private readonly token?: string) {}

    fetchRemoteBranches = async (): Promise<void> => {
        try {
            logDebugInfo('Fetching tags and forcing fetch...');
            await this.git(['fetch', '--tags', '--force']);

            logDebugInfo('Fetching all remote branches with verbose output...');
            await this.git(['fetch', '--all', '-v']);

            logDebugInfo('Successfully fetched all remote branches.');
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to fetch remote branches.'));
            throw error;
        }
    };

    getLatestTag = async (): Promise<string | undefined> => {
        try {
            logDebugInfo('Fetching the latest tag...');
            await this.git(['fetch', '--tags']);

            const tags: string[] = [];
            await exec.exec('git', ['tag', '--sort=-creatordate'], {
                listeners: {
                    stdout: (data: Buffer) => {
                        tags.push(...data.toString().split('\n').map((v) => {
                            return v.replace('v', '');
                        }));
                    },
                },
            });

            const validTags = tags.filter(tag => /\d+\.\d+\.\d+$/.test(tag));

            if (validTags.length > 0) {
                const latestTag = getLatestVersion(validTags);
                logDebugInfo(`Latest tag: ${latestTag}`);
                return latestTag;
            } else {
                logDebugInfo('No valid tags found.');
                return undefined;
            }
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to fetch the latest tag.'));
            throw error;
        }
    };

    getCommitTag = async (latestTag: string | undefined): Promise<string | undefined> => {
        try {
            if (!latestTag) {
                throw new Error('No LATEST_TAG found in the environment');
            }

            let tagVersion: string;
            if (latestTag.startsWith('v')) {
                tagVersion = latestTag;
            } else {
                tagVersion = `v${latestTag}`;
            }

            logDebugInfo(`Fetching commit hash for the tag: ${tagVersion}`);
            let commitOid = '';
            await exec.exec('git', ['rev-list', '-n', '1', tagVersion], {
                listeners: {
                    stdout: (data: Buffer) => {
                        commitOid = data.toString().trim();
                    },
                },
            });

            if (commitOid) {
                logDebugInfo(`Commit tag: ${commitOid}`);
                return commitOid;
            } else {
                throw new Error('No commit found for the tag');
            }
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to fetch the commit hash.'));
            throw error;
        }
        return undefined;
    };

    private async git(args: string[]): Promise<number> {
        const environment = buildGitAuthenticationEnvironment(this.token);
        return environment
            ? exec.exec('git', args, { env: environment })
            : exec.exec('git', args);
    }
}
