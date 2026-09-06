import { Execution } from '../data/model/execution';
import { Result } from '../data/model/result';
import { ProjectBoardCommandPort } from '../application/ports/project_board_command_ports';
import type { LatestTagQueryPort } from '../application/ports/branch_tag_ports';
import { clearAccumulatedLogs, logDebugInfo, logInfo } from '../utils/logger';
import { resolveMainRunRoute } from './main_run_route';
import { createSetupExecutionUseCase } from '../infrastructure/composition/execution_setup_composition_root';
import { createMainRunRouteCompositionRoot } from '../infrastructure/composition/main_run_route_composition_root';
import { requireRepositoryCoordinates } from './repository_context';
import { configureApplicationLogger, setGlobalLoggerDebug } from '../application/ports/logging_ports';
import { createLoggerAdapter } from '../infrastructure/logging/logger_adapter';
import type { SynchronizeLifecycleStateUseCase } from '../application/usecases/actions/synchronize_lifecycle_state_use_case';
import type { SynchronizeAgentActivityUseCase } from '../application/usecases/actions/synchronize_agent_activity_use_case';
import { shouldTrackAgentActivity, type AgentActivityRoute } from '../application/policies/agent_activity_policy';
import {
    logWelcomeMessage,
    runMainRoute,
    runNoIssueExecution,
    runTokenExecution,
    waitForPreviousWorkflowRuns,
} from './main_run_lifecycle';

export async function mainRun(
    execution: Execution,
    projectBoardCommandPort: ProjectBoardCommandPort,
    latestTagQueryPort: LatestTagQueryPort,
    lifecycleStateUseCase?: SynchronizeLifecycleStateUseCase,
    agentActivityUseCase?: SynchronizeAgentActivityUseCase,
): Promise<Result[]> {
    configureApplicationLogger(createLoggerAdapter());
    setGlobalLoggerDebug(execution.debug, execution.inputs === undefined);
    const repository = requireRepositoryCoordinates({
        owner: execution.owner,
        repo: execution.repo,
    });

    logInfo('GitHub Action: starting main run.');
    logDebugInfo(`Event: ${execution.eventName}, actor: ${execution.actor}, repo: ${repository.owner}/${repository.repo}, debug: ${execution.debug}`);

    if (!execution.welcome) {
        // Queue before setup or route work so executions cannot overlap mutations.
        await waitForPreviousWorkflowRuns(execution.tokens.token, repository);
    }

    await createSetupExecutionUseCase(latestTagQueryPort).invoke(execution);
    clearAccumulatedLogs();

    logDebugInfo(`Setup done. Issue number: ${execution.issueNumber}, isSingleAction: ${execution.isSingleAction}, isIssue: ${execution.isIssue}, isPullRequest: ${execution.isPullRequest}, isPush: ${execution.isPush}`);

    const routeHandlers = createMainRunRouteCompositionRoot(projectBoardCommandPort);
    
    if (execution.runnedByToken) {
        return runTrackedRoute(execution, 'single-action', () => runTokenExecution(execution, routeHandlers), undefined, agentActivityUseCase);
    }

    if (execution.issueNumber === -1) {
        return runTrackedRoute(execution, 'single-action', () => runNoIssueExecution(execution, routeHandlers), undefined, agentActivityUseCase);
    }

    logWelcomeMessage(execution);
    const route = resolveMainRunRoute({
        isSingleAction: execution.isSingleAction,
        isIssue: execution.isIssue,
        isIssueComment: execution.issue.isIssueComment,
        isPullRequest: execution.isPullRequest,
        isPullRequestReviewComment: execution.pullRequest.isPullRequestReviewComment,
        isPush: execution.isPush,
    });
    if (route === 'unhandled') return runMainRoute(execution, route, routeHandlers);
    return runTrackedRoute(
        execution,
        route,
        () => runMainRoute(execution, route, routeHandlers),
        lifecycleStateUseCase,
        agentActivityUseCase,
    );
}

async function runTrackedRoute(
    execution: Execution,
    route: AgentActivityRoute,
    run: () => Promise<Result[]>,
    lifecycleStateUseCase: SynchronizeLifecycleStateUseCase | undefined,
    agentActivityUseCase: SynchronizeAgentActivityUseCase | undefined,
): Promise<Result[]> {
    const trackActivity = agentActivityUseCase !== undefined && shouldTrackAgentActivity(execution, route);
    if (trackActivity) await agentActivityUseCase.start(execution);

    try {
        const results = await run();
        if (!lifecycleStateUseCase) return results;
        return [...results, ...(await lifecycleStateUseCase.invoke({ execution, results }))];
    } finally {
        if (trackActivity) await agentActivityUseCase.finish(execution);
    }
}
