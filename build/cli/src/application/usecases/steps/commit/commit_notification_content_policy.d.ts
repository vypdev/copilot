import type { Execution } from "../../../../data/model/execution";
export interface CommitNotificationContent {
    body: string;
    shouldWarn: boolean;
}
export declare function buildCommitNotificationContent(param: Execution, commitPrefix: string): CommitNotificationContent;
