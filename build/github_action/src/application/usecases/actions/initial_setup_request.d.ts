import type { Execution } from '../../../data/model/execution';
import type { IssueTypes } from '../../../data/model/issue_types';
import type { Labels } from '../../../data/model/labels';
import type { SetupConfiguration } from '../../../domain/setup';
import type { SetupRepositoryContext } from './setup_resource_provisioning';
/** Narrow input assembled by the execution adapter for the setup workflow. */
export interface InitialSetupRequest extends SetupRepositoryContext {
    labels: Labels;
    issueTypes: IssueTypes;
    setupConfiguration?: SetupConfiguration;
    workflowUpdates: readonly string[];
}
/** Converts the legacy execution aggregate into the setup use case's explicit request. */
export declare function createInitialSetupRequest(execution: Execution): InitialSetupRequest;
