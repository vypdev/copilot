import type { Execution } from '../../../../data/model/execution';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import type { ApplicationLogReportReaderPort } from '../../../ports/logging_ports';
export declare function runPublishResume(param: Execution, taskId: string, issueNotificationPort: IssueNotificationPort, logReport: ApplicationLogReportReaderPort): Promise<void>;
