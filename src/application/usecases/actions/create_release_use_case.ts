import { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import type { RepositoryReleasePublicationPort } from "../../ports/repository_release_ports";
import { INPUT_KEYS } from "../../../utils/constants";
import { logError, logInfo, logWarn } from "../../ports/logging_ports";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../base/param_usecase";

/** Semantic version pattern: x, x.y, or x.y.z (digits only, no leading 'v'). */
const SEMVER_PATTERN = /^\d+(\.\d+){0,2}$/;

function normalizeAndValidateVersion(
    version: string
): { valid: true; normalized: string } | { valid: false; error: string } {
    const trimmed = version.trim();
    const withoutV = trimmed.startsWith("v") ? trimmed.slice(1).trim() : trimmed;
    if (withoutV.length === 0) {
        return {
            valid: false,
            error: `${INPUT_KEYS.SINGLE_ACTION_VERSION} must be a semantic version (e.g. 1.0.0).`,
        };
    }
    if (!SEMVER_PATTERN.test(withoutV)) {
        return {
            valid: false,
            error: `${INPUT_KEYS.SINGLE_ACTION_VERSION} must be a semantic version (e.g. 1.0.0). Got: ${version}`,
        };
    }
    return { valid: true, normalized: withoutV };
}

export class CreateReleaseUseCase  implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CreateReleaseUseCase';
    
    constructor(private readonly repositoryReleasePort: RepositoryReleasePublicationPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const result: Result[] = [];

        if (param.singleAction.version.length === 0) {
            logError(`Version is not set.`)
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [
                        `${INPUT_KEYS.SINGLE_ACTION_VERSION} is not set.`
                    ],
                })
            );
            return result;
        } else if (param.singleAction.title.length === 0) {
            logError(`Title is not set.`)
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [
                        `${INPUT_KEYS.SINGLE_ACTION_TITLE} is not set.`
                    ],
                })
            );
            return result;
        } else if (param.singleAction.changelog.length === 0) {
            logError(`Changelog is not set.`)
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [
                        `${INPUT_KEYS.SINGLE_ACTION_CHANGELOG} is not set.`
                    ],
                })
            );
            return result;
        }

        const versionCheck = normalizeAndValidateVersion(param.singleAction.version);
        if (!versionCheck.valid) {
            logError(versionCheck.error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [versionCheck.error],
                })
            );
            return result;
        }

        const releaseVersion = `v${versionCheck.normalized}`;
        try {
            const releaseUrl = await this.repositoryReleasePort.createRelease(
                param.owner,
                param.repo,
                releaseVersion,
                param.singleAction.title,
                param.singleAction.changelog,
                param.tokens.token,
            );
            if (releaseUrl) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [`Created release \`${releaseUrl}\`.`],
                    })
                );
            } else {
                logWarn(`CreateRelease: createRelease returned no URL for version ${releaseVersion}.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        errors: [
                            `Failed to create release.`
                        ],
                    })
                );
            }
        } catch (error) {
            logError(`Error executing ${this.taskId}: ${error}`);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Failed to create release.`],
                    errors: [error],
                })
            );
        }
        return result;
    }
}
