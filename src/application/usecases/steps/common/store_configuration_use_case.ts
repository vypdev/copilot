import { ApplicationError } from '../../../errors/application_error';
import type {
    ConfigurationPersistenceContext,
    ConfigurationStorePort,
} from "../../../ports/configuration_store_ports";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";


/** Stores the projected execution configuration in issue-like content. */
export interface ConfigurationPersistenceSource {
    readonly isSingleAction: boolean;
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly isPush: boolean;
    readonly issueNumber: number;
    readonly issue: { readonly number: number };
    readonly pullRequest: { readonly number: number };
    readonly singleAction: { readonly issue: number };
    readonly currentConfiguration: ConfigurationPersistenceContext['currentConfiguration'];
}

export function projectConfigurationPersistenceContext(
    source: ConfigurationPersistenceSource,
): ConfigurationPersistenceContext | undefined {
    const issueNumber = resolveWriteIssueNumber(source);
    if (issueNumber === undefined) return undefined;
    const configuration = source.currentConfiguration;
    return Object.freeze({
        issueNumber,
        currentConfiguration: Object.freeze({
            branchType: configuration.branchType,
            releaseBranch: configuration.releaseBranch,
            workingBranch: configuration.workingBranch,
            parentBranch: configuration.parentBranch,
            hotfixOriginBranch: configuration.hotfixOriginBranch,
            hotfixBranch: configuration.hotfixBranch,
            releaseOriginBranch: configuration.releaseOriginBranch,
            releaseOriginSha: configuration.releaseOriginSha,
            hotfixOriginSha: configuration.hotfixOriginSha,
            deploymentOrchestration: clonePlainValue(configuration.deploymentOrchestration),
            branchConfiguration: clonePlainValue(configuration.branchConfiguration),
            recommendationState: clonePlainValue(configuration.recommendationState),
        }),
    });
}

export class StoreConfigurationUseCase implements ParamUseCase<ConfigurationPersistenceContext, void> {
    taskId: string = 'StoreConfigurationUseCase';
    constructor(private readonly configurationStorePort: ConfigurationStorePort) {}

    async invoke(param: ConfigurationPersistenceContext): Promise<void> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)
        try {
            await this.configurationStorePort.update(param)
        } catch (error) {
            const semanticError = new ApplicationError('provider.unavailable', 'Configuration persistence failed.', { cause: error });
            logError(semanticError);
            throw semanticError;
        }
    }
}

function resolveWriteIssueNumber(source: ConfigurationPersistenceSource): number | undefined {
    if (source.isSingleAction) {
        if (source.isIssue) return source.issue.number;
        if (source.isPullRequest) return source.pullRequest.number;
        if (source.isPush) return source.issueNumber;
        return source.singleAction.issue > 0 ? source.singleAction.issue : undefined;
    }
    if (source.isIssue) return source.issue.number;
    if (source.isPullRequest) return source.pullRequest.number;
    if (source.isPush) return source.issueNumber > 0 ? source.issueNumber : undefined;
    return undefined;
}

function clonePlainValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return Object.freeze(value.map((entry) => clonePlainValue(entry))) as T;
    }
    if (value && typeof value === 'object') {
        const clone = Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, clonePlainValue(entry)]),
        );
        return Object.freeze(clone) as T;
    }
    return value;
}
