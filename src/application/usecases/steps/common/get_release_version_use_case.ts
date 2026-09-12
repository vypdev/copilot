import { Result } from "../../../../data/model/result";
import { extractVersion } from "../../../../utils/content_utils";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { SetupIssueQueryPort } from '../../../ports/setup_execution_ports';
import type { VersionDescriptionContext } from '../../execution/setup_execution_contracts';

export class GetReleaseVersionUseCase implements ParamUseCase<VersionDescriptionContext, Result[]> {
    taskId: string = 'GetReleaseVersionUseCase';
    
    constructor(private readonly issueRepository: Pick<SetupIssueQueryPort, 'getDescription'>) {}

    async invoke(param: VersionDescriptionContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const result: Result[] = [];

        try {
            if (!isPositiveIssueNumber(param.issueNumber)) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Tried to get the version but there was a problem identifying the issue.`],
                    })
                );
                return result;
            }

            const description = await this.issueRepository.getDescription(param.issueNumber)

            if (description === undefined) {
                logDebugInfo(`GetReleaseVersion: no description for issue ${param.issueNumber}.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Tried to get the version but there was a problem getting the description.`],
                    })
                );
                return result;
            }

            const releaseVersion = extractVersion('Release Version', description)

            if (releaseVersion === undefined) {
                logDebugInfo(`GetReleaseVersion: no "Release Version" found in description (issue ${param.issueNumber}).`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                    })
                );
                return result;
            }

            result.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    payload: {
                        releaseVersion: releaseVersion,
                    }
                })
            );
        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to read the release version.');
            logError(semanticError);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Tried to get the release version but there was a problem.`],
                    errors: [semanticError],
                })
            );
        }

        return result;
    }
}

function isPositiveIssueNumber(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
}
