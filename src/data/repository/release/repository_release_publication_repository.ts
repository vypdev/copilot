import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubReleaseClient } from "../../../application/ports/github_release_ports";
import { logError, logInfo } from "../../../utils/logger";
import { hasReleaseContent, releasePayload } from "../release_content_policy";
import { findTargetRelease, releaseIdAsString } from "../release_transition_policy";
import { releaseName } from "../release_tag_policy";
import type { RepositoryReleasePublicationPort } from "../../../application/ports/repository_release_ports";

export class RepositoryReleasePublicationRepository implements RepositoryReleasePublicationPort {
    constructor(private readonly githubClient: GithubClientPort<GithubReleaseClient>) {}

    updateRelease = async (
        owner: string,
        repository: string,
        sourceTag: string,
        targetTag: string,
        token: string,
    ): Promise<string | undefined> => {
        const octokit = this.githubClient.getClient(token);
        const { data: sourceRelease } = await octokit.rest.repos.getReleaseByTag({
            owner,
            repo: repository,
            tag: sourceTag,
        });
        if (!hasReleaseContent(sourceRelease)) {
            logError(`The '${sourceTag}' tag does not exist in the remote repository`);
            return undefined;
        }

        const { data: releases } = await octokit.rest.repos.listReleases({ owner, repo: repository });
        const targetRelease = findTargetRelease(releases, targetTag, (release) => release.tag_name);
        let targetReleaseId: number;
        if (targetRelease) {
            await octokit.rest.repos.updateRelease({
                owner,
                repo: repository,
                release_id: targetRelease.id,
                name: sourceRelease.name,
                body: sourceRelease.body,
                draft: sourceRelease.draft,
                prerelease: sourceRelease.prerelease,
            });
            targetReleaseId = targetRelease.id;
        } else {
            const payload = releasePayload(targetTag, sourceRelease);
            const { data: newRelease } = await octokit.rest.repos.createRelease({
                owner,
                repo: repository,
                ...payload,
            });
            targetReleaseId = newRelease.id;
        }

        logInfo(`Updated release for targetTag '${targetTag}'`);
        return releaseIdAsString(targetReleaseId);
    };

    createRelease = async (
        owner: string,
        repository: string,
        version: string,
        title: string,
        changelog: string,
        token: string,
    ): Promise<string | undefined> => {
        try {
            const octokit = this.githubClient.getClient(token);
            const { data: release } = await octokit.rest.repos.createRelease({
                owner,
                repo: repository,
                tag_name: version,
                name: releaseName(version, title),
                body: changelog,
                draft: false,
                prerelease: false,
            });
            return release.html_url;
        } catch (error) {
            logError(`Error creating release: ${error}`);
            return undefined;
        }
    };
}
