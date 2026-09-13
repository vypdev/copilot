import { Execution } from '../data/model/execution';
import { Result } from '../data/model/result';
import { ProjectBoardCommandPort } from '../application/ports/project_board_command_ports';
import type { LatestTagQueryPort } from '../application/ports/branch_tag_ports';
import { clearAccumulatedLogs, logDebugInfo, logInfo } from '../utils/logger';
import { resolveMainRunRoute } from './main_run_route';
import { createSetupExecutionUseCase } from '../infrastructure/composition/execution_setup_composition_root';
import { applySetupExecutionResult, projectSetupExecutionContext } from './setup_execution_boundary';
import {
    createMainRunRouteCompositionRoot,
    type MainRunCompositionSurface,
} from '../infrastructure/composition/main_run_route_composition_root';
import { requireRepositoryCoordinates } from './repository_context';
import { configureApplicationLogger, setGlobalLoggerDebug } from '../application/ports/logging_ports';
import { createLoggerAdapter } from '../infrastructure/logging/logger_adapter';
import type { SynchronizeLifecycleStateUseCase } from '../application/usecases/actions/synchronize_lifecycle_state_use_case';
import {
    projectLifecycleSynchronizationContext,
    type LifecycleSynchronizationOutcome,
} from '../application/usecases/actions/lifecycle_synchronization_context';
import type { SynchronizeAgentActivityUseCase } from '../application/usecases/actions/synchronize_agent_activity_use_case';
import { shouldTrackAgentActivity, type AgentActivityRoute } from '../application/policies/agent_activity_policy';
import {
    projectAgentActivityContext,
    type AgentActivityOutcome,
} from '../application/usecases/push_single_action_contexts';
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
    compositionSurface: MainRunCompositionSurface,
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

    if (process.env.GITHUB_ACTIONS === 'true' && !execution.singleAction.isPublishIssueCommentAction) {
        // Every GitHub workflow invocation queues before setup or route work so
        // executions of the same workflow file cannot overlap mutations. A
        // failure notification must remain runnable when that queue gate fails.
        await waitForPreviousWorkflowRuns(execution.tokens.token, repository);
    }

    const setupExecution = createSetupExecutionUseCase(latestTagQueryPort, {
        owner: repository.owner,
        repository: repository.repo,
        token: execution.tokens.token,
    });
    applySetupExecutionResult(execution, await setupExecution.invoke(projectSetupExecutionContext(execution)));
    clearAccumulatedLogs();

    logDebugInfo(`Setup done. Issue number: ${execution.issueNumber}, isSingleAction: ${execution.isSingleAction}, isIssue: ${execution.isIssue}, isPullRequest: ${execution.isPullRequest}, isPush: ${execution.isPush}`);

    const routeHandlers = createMainRunRouteCompositionRoot(projectBoardCommandPort, compositionSurface);
    
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
    if (trackActivity) applyAgentActivityOutcome(execution, await agentActivityUseCase.start(projectAgentActivityContext(execution)));

    try {
        const results = await run();
        if (!lifecycleStateUseCase) return results;
        const lifecycleOutcome = await lifecycleStateUseCase.invoke({
            context: projectLifecycleSynchronizationContext(execution),
            results,
        });
        applyLifecycleSynchronizationOutcome(execution, lifecycleOutcome);
        return [...results, ...lifecycleOutcome.results];
    } finally {
        if (trackActivity) applyAgentActivityOutcome(execution, await agentActivityUseCase.finish(projectAgentActivityContext(execution)));
    }
}

function applyLifecycleSynchronizationOutcome(
    execution: Execution,
    outcome: LifecycleSynchronizationOutcome,
): void {
    const patch = outcome.labelPatch;
    if (!patch) return;
    if (patch.target.kind === 'pull-request') {
        execution.labels.currentPullRequestLabels = [...patch.labels];
    } else {
        execution.labels.currentIssueLabels = [...patch.labels];
    }
}

function applyAgentActivityOutcome(execution: Execution, outcome: AgentActivityOutcome): void {
    if (!outcome?.target || !outcome.labels) return;
    if (outcome.target.kind === 'pull-request') {
        execution.labels.currentPullRequestLabels = [...outcome.labels];
    } else {
        execution.labels.currentIssueLabels = [...outcome.labels];
    }
}
