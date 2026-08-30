import * as core from '@actions/core';
import chalk from 'chalk';
import boxen from 'boxen';
import type { Execution } from '../data/model/execution';
import type { Result } from '../data/model/result';
import { TITLE } from '../utils/constants';
import { logError, logInfo } from '../utils/logger';
import { dispatchMainRunRoute } from './main_run_dispatcher';
import type { ExecutableMainRunRoute, MainRunRouteHandlers } from './main_run_route_handlers';
import type { RepositoryCoordinates } from './repository_context';
import { resolveWorkflowIdentifier } from './workflow_context';
import { createWaitForPreviousWorkflowRunsUseCase } from '../infrastructure/composition/workflow_queue_composition_root';
import { COPILOT_WORKFLOW_NAMES } from '../application/policies/workflow_queue_policy';
import type { PreviousWorkflowRunsQuery } from '../application/ports/workflow_run_ports';

export function buildPreviousWorkflowRunsQuery(
    repository: RepositoryCoordinates,
): PreviousWorkflowRunsQuery {
    const query: PreviousWorkflowRunsQuery = {
        owner: repository.owner,
        repository: repository.repo,
        currentRunId: Number.parseInt(process.env.GITHUB_RUN_ID ?? '', 10),
        workflowName: process.env.GITHUB_WORKFLOW ?? '',
        workflowNames: COPILOT_WORKFLOW_NAMES,
    };
    const workflowIdentifier = resolveWorkflowIdentifier(process.env.GITHUB_WORKFLOW_REF);
    if (workflowIdentifier) {
        query.workflowIdentifier = workflowIdentifier;
    }

    return query;
}

export async function waitForPreviousWorkflowRuns(
    execution: Execution,
    repository: RepositoryCoordinates,
): Promise<void> {
    const query = buildPreviousWorkflowRunsQuery(repository);
    if (process.env.GITHUB_ACTIONS === 'true' && !Number.isSafeInteger(query.currentRunId)) {
        throw new Error('GitHub workflow identity is unavailable; refusing to bypass sequential execution.');
    }
    await createWaitForPreviousWorkflowRunsUseCase(execution.tokens.token)
        .invoke(query)
        .catch((error: unknown) => {
            logError(`Error waiting for previous runs: ${error}`);
            throw error;
        });
}

export function logWelcomeMessage(execution: Execution): void {
    if (!execution.welcome) return;

    logInfo(
        boxen(
            chalk.cyan(execution.welcome.title) + '\n' +
            execution.welcome.messages.map(message => chalk.gray(message)).join('\n'),
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
                title: TITLE,
                titleAlignment: 'center',
            },
        ),
    );
}

export async function runTokenExecution(
    execution: Execution,
    routeHandlers: MainRunRouteHandlers,
): Promise<Result[]> {
    if (execution.isSingleAction && execution.singleAction.validSingleAction) {
        logInfo(`User from token (${execution.tokenUser}) matches actor. Executing single action: ${execution.singleAction.currentSingleAction}.`);
        const results = await dispatchMainRunRoute('single-action', execution, routeHandlers);
        logInfo(`Single action finished. Results: ${results.length}.`);
        return results;
    }

    logInfo(`User from token (${execution.tokenUser}) matches actor. Ignoring (not a valid single action).`);
    return [];
}

export async function runNoIssueExecution(
    execution: Execution,
    routeHandlers: MainRunRouteHandlers,
): Promise<Result[]> {
    if (execution.isSingleAction && execution.singleAction.isSingleActionWithoutIssue) {
        logInfo('No issue number; running single action without issue.');
        return dispatchMainRunRoute('single-action', execution, routeHandlers);
    }

    logInfo('Issue number not found. Skipping.');
    return [];
}

export async function runMainRoute(
    execution: Execution,
    route: ExecutableMainRunRoute | 'unhandled',
    routeHandlers: MainRunRouteHandlers,
): Promise<Result[]> {
    try {
        let results: Result[];
        if (route === 'unhandled') {
            logError(`Action not handled. Event: ${execution.eventName}.`);
            core.setFailed('Action not handled.');
            results = [];
        } else {
            results = await dispatchMainRunRoute(route, execution, routeHandlers);
        }

        const totalSteps = results.reduce((acc, result) => acc + (result.steps?.length ?? 0), 0);
        logInfo(`Main run finished. Results: ${results.length}, total steps: ${totalSteps}.`);
        return results;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`Main run failed: ${message}`, error instanceof Error ? { stack: error.stack } : undefined);
        core.setFailed(message);
        return [];
    }
}
