import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { BugbotFindingResolutionPorts } from '../../../../../application/ports/bugbot_finding_resolution_ports';
import { loadBugbotContext } from './load_bugbot_context_use_case';
import { markFindingsResolved } from './mark_findings_resolved_workflow';
import { normalizeFindingIdForMarker } from './marker';
import { logError } from '../../../../ports/logging_ports';

export interface DismissBugbotFindingsParam {
    execution: Execution;
    findingIds: readonly string[];
}

export interface DismissBugbotFindingsDependencies {
    contextPorts: BugbotContextPorts;
    resolutionPorts: BugbotFindingResolutionPorts;
}

/** Dismisses only findings present in the current persisted Bugbot context. */
export class DismissBugbotFindingsUseCase {
    readonly taskId = 'DismissBugbotFindingsUseCase';

    constructor(private readonly dependencies: DismissBugbotFindingsDependencies) {}

    async invoke(param: DismissBugbotFindingsParam): Promise<Result[]> {
        try {
            const context = await loadDismissContext(param.execution, this.dependencies.contextPorts);
            const requestedIds = new Set(param.findingIds.flatMap(id => {
                const normalized = normalizeFindingIdForMarker(id);
                return normalized ? [normalized] : [];
            }));
            const existingIds = new Set(Object.keys(context.existingByFindingId));
            const dismissibleIds = new Set([...requestedIds].filter(id => existingIds.has(id)));
            if (dismissibleIds.size === 0) {
                return [new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: ['No matching Bugbot findings were found; nothing was dismissed.'],
                })];
            }

            const errors = await markFindingsResolved({
                execution: param.execution,
                context,
                resolvedFindingIds: dismissibleIds,
                ports: this.dependencies.resolutionPorts,
            });
            return [new Result({
                id: this.taskId,
                success: errors.length === 0,
                executed: true,
                steps: [`Dismissed ${dismissibleIds.size} Bugbot finding(s) by explicit user command.`],
                errors,
            })];
        } catch (error) {
            const message = `Unable to dismiss Bugbot findings: ${error instanceof Error ? error.message : String(error)}`;
            logError(message);
            return [new Result({ id: this.taskId, success: false, executed: true, errors: [message] })];
        }
    }
}

async function loadDismissContext(
    execution: Execution,
    ports: BugbotContextPorts,
) {
    const branch = execution.commit.branch?.trim()
        || await ports.pullRequest.getHeadBranchForIssue(
            execution.owner,
            execution.repo,
            execution.issueNumber,
            execution.tokens.token,
        );
    return loadBugbotContext(execution, branch ? { branchOverride: branch } : undefined, ports);
}

