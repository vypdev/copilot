import type { Execution } from '../../../../data/model/execution';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import type { ApplicationLogReportReaderPort } from '../../../ports/logging_ports';
import { logInfo } from '../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../utils/task_emoji';
import { ParamUseCase } from '../../base/param_usecase';
import { runPublishResume } from './publish_resume_workflow';

export class PublishResultUseCase implements ParamUseCase<Execution, void> {
    taskId = 'PublishResultUseCase';

    constructor(
        private readonly issueNotificationPort: IssueNotificationPort,
        private readonly logReport: ApplicationLogReportReaderPort,
    ) {}

    async invoke(param: Execution): Promise<void> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runPublishResume(param, this.taskId, this.issueNotificationPort, this.logReport);
    }
}
