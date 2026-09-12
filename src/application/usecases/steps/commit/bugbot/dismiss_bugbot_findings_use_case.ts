import { Result } from '../../../../../data/model/result';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { BugbotFindingResolutionPorts } from '../../../../../application/ports/bugbot_finding_resolution_ports';
import { loadBugbotContext } from './load_bugbot_context_use_case';
import { projectBugbotContextRequest } from './bugbot_context_request';
import { markFindingsResolved } from './mark_findings_resolved_workflow';
import { normalizeFindingIdForMarker } from '../../../../policies/bugbot_finding_marker_policy';
import { logError } from '../../../../ports/logging_ports';
import type { BugbotFindingResolution } from '../../../../../domain/bugbot/finding';
import { toApplicationError } from '../../../../errors/application_error';
import type { BugbotContextSelectionContext } from './bugbot_review_operation_context';

export interface DismissBugbotFindingsParam {
    operation: BugbotContextSelectionContext;
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
            const context = await loadDismissContext(param.operation, this.dependencies.contextPorts);
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
                operation: param.operation,
                context,
                resolvedFindingIds: dismissibleIds,
                resolvedFindingResolutions: new Map([...dismissibleIds].map(id => [id, 'dismissed' as BugbotFindingResolution])),
                ports: this.dependencies.resolutionPorts,
            });
            return [new Result({
                id: this.taskId,
                success: errors.length === 0,
                executed: true,
                steps: [`Dismissed ${dismissibleIds.size} Bugbot finding(s) by explicit user command.`],
                errors: errors.map(error => toApplicationError(
                    error,
                    'provider.unavailable',
                    'A Bugbot finding could not be dismissed.',
                )),
            })];
        } catch (error) {
            const message = `Unable to dismiss Bugbot findings: ${error instanceof Error ? error.message : String(error)}`;
            logError(message);
            return [new Result({
                id: this.taskId,
                success: false,
                executed: true,
                errors: [toApplicationError(error, 'provider.unavailable', 'Unable to dismiss Bugbot findings.')],
            })];
        }
    }
}

async function loadDismissContext(
    operation: BugbotContextSelectionContext,
    ports: BugbotContextPorts,
) {
    const branch = operation.target.commitBranch || operation.target.headBranch;
    if (branch) {
        return loadBugbotContext(projectBugbotContextRequest(operation, {
            branchOverride: branch,
            ...(operation.target.pullRequestNumber > 0
                ? { pullRequestNumberOverride: operation.target.pullRequestNumber }
                : {}),
        }), ports);
    }
    return loadBugbotContext(projectBugbotContextRequest(operation), ports);
}
