import { Result } from '../../../../data/model/result';
import { ISSUE_START_LABEL } from '../../../../domain/issue_start_policy';
import type { BoundIssueCompletionReadPort } from '../../../ports/issue_completion_ports';
import type { BoundProjectBoardCommandPort } from '../../../ports/project_board_command_ports';
import { ApplicationError, toApplicationError } from '../../../errors/application_error';
import type { MoveIssueToInProgressContext } from '../../issue_workflow_context';

/** Restore active Project state before other field writes can retrigger native autoclose. */
export class ResumeIssueProjectUseCase {
    readonly taskId = 'ResumeIssueProjectUseCase';
    constructor(private readonly native: BoundIssueCompletionReadPort, private readonly projects: BoundProjectBoardCommandPort) {}

    async invoke(context: MoveIssueToInProgressContext): Promise<Result[]> {
        let changed = 0;
        const fence = async () => {
            const current = await this.native.readIssue(context.issueNumber);
            if (current.number !== context.issueNumber || current.state !== 'open' || current.reason !== 'reopened'
                || !current.labels.includes(ISSUE_START_LABEL)) {
                throw new ApplicationError('workflow.stale', 'The reopened issue is no longer open and started; Project enrichment was stopped.');
            }
        };
        try {
            if (!Number.isSafeInteger(context.issueNumber) || context.issueNumber < 1) {
                throw new ApplicationError('provider.contract-invalid', 'A safe issue identity is required before Project enrichment.');
            }
            await fence();
            for (const project of context.projects) {
                await fence();
                if (await this.projects.moveIssueToColumn(project, context.issueNumber, context.columnName)) changed++;
                await fence();
            }
            return [new Result({ id: this.taskId, success: true, executed: changed > 0,
                steps: ['The reopened issue Project state was verified before enrichment.'],
                payload: { resumedProject: { changed, verified: true } } })];
        } catch (error) {
            return [new Result({ id: this.taskId, success: false, executed: changed > 0,
                steps: ['Project enrichment stopped. Retry the reopened-issue run after checking its current start label and configured Project column; any successful Project updates were retained.'],
                errors: [toApplicationError(error, 'provider.unavailable', 'The reopened issue Project state could not be verified.')],
                payload: { resumedProject: { changed, verified: false } } })];
        }
    }
}
