import * as core from '@actions/core';
import { Execution } from '../data/model/execution';
import { Result } from '../data/model/result';
import { ProjectBoardCommandPort } from '../application/ports/project_board_command_ports';
import type { LatestTagQueryPort } from '../application/ports/branch_tag_ports';
import { clearAccumulatedLogs, logDebugInfo, logError, logInfo } from '../utils/logger';
import { TITLE } from '../utils/constants';
import chalk from 'chalk';
import boxen from 'boxen';
import { resolveMainRunRoute } from './main_run_route';
import { dispatchMainRunRoute } from './main_run_dispatcher';
import { createSetupExecutionUseCase } from '../infrastructure/composition/execution_setup_composition_root';
import { createWaitForPreviousWorkflowRunsUseCase } from '../infrastructure/composition/workflow_queue_composition_root';
import { createMainRunRouteCompositionRoot } from '../infrastructure/composition/main_run_route_composition_root';

export async function mainRun(
    execution: Execution,
    projectBoardCommandPort: ProjectBoardCommandPort,
    latestTagQueryPort: LatestTagQueryPort,
): Promise<Result[]> {
    const results: Result[] = [];

    logInfo('GitHub Action: starting main run.');
    logDebugInfo(`Event: ${execution.eventName}, actor: ${execution.actor}, repo: ${execution.owner}/${execution.repo}, debug: ${execution.debug}`);

    await createSetupExecutionUseCase(latestTagQueryPort).invoke(execution);
    clearAccumulatedLogs();

    logDebugInfo(`Setup done. Issue number: ${execution.issueNumber}, isSingleAction: ${execution.isSingleAction}, isIssue: ${execution.isIssue}, isPullRequest: ${execution.isPullRequest}, isPush: ${execution.isPush}`);

    if (!execution.welcome) {
        /**
         * Wait for previous runs to finish
         */
        await createWaitForPreviousWorkflowRunsUseCase(execution.tokens.token).invoke({
            owner: execution.owner,
            repository: execution.repo,
            currentRunId: Number.parseInt(process.env.GITHUB_RUN_ID ?? '', 10),
            workflowName: process.env.GITHUB_WORKFLOW ?? '',
        }).catch((err) => {
            logError(`Error waiting for previous runs: ${err}`);
            throw err;
        });
    }

    const routeHandlers = createMainRunRouteCompositionRoot(projectBoardCommandPort);
    
    if (execution.runnedByToken) {
        if (execution.isSingleAction && execution.singleAction.validSingleAction) {
            logInfo(`User from token (${execution.tokenUser}) matches actor. Executing single action: ${execution.singleAction.currentSingleAction}.`);
            results.push(...await dispatchMainRunRoute('single-action', execution, routeHandlers));
            logInfo(`Single action finished. Results: ${results.length}.`);
            return results;
        }
        logInfo(`User from token (${execution.tokenUser}) matches actor. Ignoring (not a valid single action).`);
        return results;
    }

    if (execution.issueNumber === -1) {
        if (execution.isSingleAction && execution.singleAction.isSingleActionWithoutIssue) {
            logInfo('No issue number; running single action without issue.');
            results.push(...await dispatchMainRunRoute('single-action', execution, routeHandlers));
        } else {
            logInfo('Issue number not found. Skipping.');
        }
        return results;
    }

    if (execution.welcome) {
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
                    titleAlignment: 'center'
                }
            )
        );
    }

    try {
        const route = resolveMainRunRoute({
            isSingleAction: execution.isSingleAction,
            isIssue: execution.isIssue,
            isIssueComment: execution.issue.isIssueComment,
            isPullRequest: execution.isPullRequest,
            isPullRequestReviewComment: execution.pullRequest.isPullRequestReviewComment,
            isPush: execution.isPush,
        });
        if (route === 'unhandled') {
            logError(`Action not handled. Event: ${execution.eventName}.`);
            core.setFailed('Action not handled.');
        } else {
            results.push(...await dispatchMainRunRoute(route, execution, routeHandlers));
        }

        const totalSteps = results.reduce((acc, r) => acc + (r.steps?.length ?? 0), 0);
        logInfo(`Main run finished. Results: ${results.length}, total steps: ${totalSteps}.`);
        return results;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Main run failed: ${msg}`, error instanceof Error ? { stack: (error as Error).stack } : undefined);
        core.setFailed(msg);
        return [];
    }
}
