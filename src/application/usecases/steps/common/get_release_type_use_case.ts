import { ALL_ISSUE_WORKFLOWS, issueWorkflowHeading } from '../../../../domain/issue_workflow_profile';
import { readIssueWorkflowFields } from '../../../../domain/issue_workflow_body';
import { Result } from "../../../../data/model/result";
import { extractReleaseType } from "../../../../utils/content_utils";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { toApplicationError } from "../../../errors/application_error";
import type { SetupIssueQueryPort } from '../../../ports/setup_execution_ports';
import type { VersionDescriptionContext } from '../../execution/setup_execution_contracts';

export class GetReleaseTypeUseCase implements ParamUseCase<VersionDescriptionContext, Result[]> {
    taskId: string = 'GetReleaseTypeUseCase';
    
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
                        steps: [`Tried to get the release type but there was a problem identifying the issue.`],
                    })
                );
                return result;
            }

            const description = param.body ?? await this.issueRepository.getDescription(param.issueNumber)

            if (description === undefined) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Tried to get the release type but there was a problem getting the description.`],
                    })
                );
                return result;
            }

            const releaseType = param.body === undefined && !param.issueWorkflowProfile ? extractReleaseType('Release Type', description) : extractReleaseType('Release Type', `### Release Type\n${readIssueWorkflowFields(description, [issueWorkflowHeading(param.issueWorkflowProfile ?? ALL_ISSUE_WORKFLOWS, 'release', 'Release Type')])[0].value.replace(/^(patch|minor|major)$/iu, value => value[0].toUpperCase() + value.slice(1).toLowerCase())}`)

            if (releaseType === undefined) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Tried to get the release type but there was a problem identifying the type.`],
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
                        releaseType: releaseType,
                    }
                })
            );
        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to read the release type.');
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
