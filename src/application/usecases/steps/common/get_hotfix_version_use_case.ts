import { Result } from "../../../../data/model/result";
import { extractVersion } from "../../../../utils/content_utils";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { SetupIssueQueryPort } from '../../../ports/setup_execution_ports';
import type { VersionDescriptionContext } from '../../execution/setup_execution_contracts';

export class GetHotfixVersionUseCase implements ParamUseCase<VersionDescriptionContext, Result[]> {
    taskId: string = 'GetHotfixVersionUseCase';
    
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

            const baseVersion = extractVersion('Base Version', description)
            const hotfixVersion = extractVersion('Hotfix Version', description)

            if (baseVersion === undefined) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Tried to get the base version but there was a problem identifying the version.`],
                    })
                );
                return result;
            } else if (hotfixVersion === undefined) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Tried to get the hotfix version but there was a problem identifying the version.`],
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
                        baseVersion: baseVersion,
                        hotfixVersion: hotfixVersion,
                    }
                })
            );
        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to read the hotfix version.');
            logError(semanticError);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Tried to check action permissions.`],
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
