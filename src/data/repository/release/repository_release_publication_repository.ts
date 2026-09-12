import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubReleaseClient } from "../../../infrastructure/github/ports/github_release_provider_ports";
import { logError, logInfo } from "../../../utils/logger";
import { hasReleaseContent, releasePayload } from "../release_content_policy";
import { findTargetRelease, releaseIdAsString } from "../release_transition_policy";
import { releaseName } from "../release_tag_policy";
import type { RepositoryReleasePublicationPort } from "../../../application/ports/repository_release_ports";
import type { DeploymentPublicationReceiptPort } from "../../../application/ports/deployment_orchestration_ports";
import { listRepositoryReleases } from './repository_release_query';
import { ApplicationError, toApplicationError } from '../../../application/errors/application_error';
import { isGithubNotFound } from '../github/github_error_policy';
import { getRepositoryTagSha } from './repository_tag_query';
import {
    parseDeploymentPublicationMarker,
    renderDeploymentReleaseBody,
} from '../../../domain/deployment_publication';

export class RepositoryReleasePublicationRepository implements RepositoryReleasePublicationPort, DeploymentPublicationReceiptPort {
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

        const releases = await listRepositoryReleases(octokit, owner, repository);
        const targetRelease = findTargetRelease(releases, targetTag, (release) => release.tag_name);
        let targetReleaseId: number;
        if (targetRelease) {
            const { data: currentTarget } = await octokit.rest.repos.getReleaseByTag({
                owner,
                repo: repository,
                tag: targetTag,
            });
            if (!sameReleaseContent(currentTarget, sourceRelease)) {
                await octokit.rest.repos.updateRelease({
                    owner,
                    repo: repository,
                    release_id: targetRelease.id,
                    name: sourceRelease.name,
                    body: sourceRelease.body,
                    draft: sourceRelease.draft,
                    prerelease: sourceRelease.prerelease,
                });
            }
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
        const { data: verifiedTarget } = await octokit.rest.repos.getReleaseByTag({
            owner,
            repo: repository,
            tag: targetTag,
        });
        if (!sameReleaseContent(verifiedTarget, sourceRelease)) {
            throw new Error(`Release alias '${targetTag}' was not verified against '${sourceTag}'.`);
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
        operationId: string,
        productionSha: string,
        token: string,
    ): Promise<string | undefined> => {
        const body = renderDeploymentReleaseBody({ operationId, productionSha }, changelog);
        const expectedName = releaseName(version, title);
        const octokit = this.githubClient.getClient(token);
        try {
            try {
                const { data: existing } = await octokit.rest.repos.getReleaseByTag({ owner, repo: repository, tag: version });
                return verifiedReleaseUrl(existing, version, expectedName, body, operationId, productionSha);
            } catch (error) {
                if (!isGithubNotFound(error)) throw error;
            }
            try {
                await octokit.rest.repos.createRelease({
                    owner, repo: repository, tag_name: version, name: expectedName, body, draft: false, prerelease: false,
                });
            } catch (error) {
                try {
                    const { data: recovered } = await octokit.rest.repos.getReleaseByTag({ owner, repo: repository, tag: version });
                    return verifiedReleaseUrl(recovered, version, expectedName, body, operationId, productionSha);
                } catch (inspectionError) {
                    if (!isGithubNotFound(inspectionError)) throw inspectionError;
                    throw error;
                }
            }
            const { data: created } = await octokit.rest.repos.getReleaseByTag({ owner, repo: repository, tag: version });
            return verifiedReleaseUrl(created, version, expectedName, body, operationId, productionSha);
        } catch (error) {
            logError(toApplicationError(error, 'provider.unavailable', 'Unable to create the release.'));
            throw error;
        }
    };

    inspect = async (command: Parameters<DeploymentPublicationReceiptPort['inspect']>[0]) => {
        const octokit = this.githubClient.getClient(command.token);
        const tagSha = await getRepositoryTagSha(octokit, command.owner, command.repository, command.tag);
        if (!tagSha) return { kind: 'absent' as const, effect: 'tag' as const };
        if (tagSha.toLowerCase() !== command.productionSha.toLowerCase()) {
            return { kind: 'conflict' as const, reason: `Immutable tag ${command.tag} resolves to ${tagSha}, expected ${command.productionSha}.` };
        }
        try {
            const { data: release } = await octokit.rest.repos.getReleaseByTag({
                owner: command.owner,
                repo: command.repository,
                tag: command.tag,
            });
            const marker = parseDeploymentPublicationMarker(release.body);
            if (release.tag_name !== undefined && release.tag_name !== command.tag) {
                return { kind: 'conflict' as const, reason: `GitHub Release resolved a different tag than ${command.tag}.` };
            }
            if (!marker || marker.operationId !== command.operationId || marker.productionSha !== command.productionSha.toLowerCase()) {
                return { kind: 'conflict' as const, reason: `GitHub Release ${command.tag} has no exact deployment publication receipt.` };
            }
            if (!release.html_url) {
                return { kind: 'conflict' as const, reason: `GitHub Release ${command.tag} has no provider URL.` };
            }
            return {
                kind: 'verified' as const,
                receipt: {
                    tag: command.tag,
                    productionSha: command.productionSha,
                    operationId: command.operationId,
                    releaseUrl: release.html_url,
                },
            };
        } catch (error) {
            if (isGithubNotFound(error)) return { kind: 'absent' as const, effect: 'release' as const };
            throw error;
        }
    };
}

function sameReleaseContent(
    left: { name?: string | null; body?: string | null; draft: boolean; prerelease: boolean },
    right: { name?: string | null; body?: string | null; draft: boolean; prerelease: boolean },
): boolean {
    return left.name === right.name
        && left.body === right.body
        && left.draft === right.draft
        && left.prerelease === right.prerelease;
}

function verifiedReleaseUrl(
    release: { html_url?: string; tag_name?: string; name?: string | null; body?: string | null; draft: boolean; prerelease: boolean },
    tag: string,
    expectedName: string,
    expectedBody: string,
    operationId: string,
    productionSha: string,
): string {
    const marker = parseDeploymentPublicationMarker(release.body);
    if ((release.tag_name !== undefined && release.tag_name !== tag)
        || release.name !== expectedName
        || release.body !== expectedBody
        || release.draft
        || release.prerelease
        || marker?.operationId !== operationId
        || marker?.productionSha !== productionSha.toLowerCase()
        || !release.html_url) {
        throw new ApplicationError('provider.conflict', `GitHub Release '${tag}' exists with conflicting publication content.`);
    }
    return release.html_url;
}
