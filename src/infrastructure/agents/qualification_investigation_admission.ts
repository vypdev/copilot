import type { AgentExecutionPlan } from '../../domain/agent_execution_plan';
import { AgentCliError } from '../../data/repository/agent_cli_contracts';
import { bindQualificationOperationPlan, hasQualificationOperationPlan } from './qualification_operation_scope';

// In-process authority, never an environment/configuration/serialized receipt.
// Only the ordinary planner registers plans, after its complete preflight.
const admissions = new WeakMap<AgentExecutionPlan, AbortSignal>();

export function admitQualificationInvestigationPlan(plan: AgentExecutionPlan, signal: AbortSignal): AgentExecutionPlan {
    if (plan.capability !== 'findings' || plan.workspaceMode !== 'read-only'
        || plan.sourceSnapshot || plan.sourceDeadlineMs !== undefined || plan.brokeredVerification
        || plan.childNetwork !== 'deny' || plan.approval !== 'never' || plan.sessionPersistence !== false) {
        throw new AgentCliError('Qualification investigation requires ordinary read-only findings authority.', 'configuration');
    }
    bindQualificationOperationPlan(plan, signal);
    // A spread/copy loses admission. Freeze all plan-owned mutable collections
    // so a registered object cannot later acquire different process authority.
    Object.freeze(plan.argv);
    if (plan.launcherArgv) Object.freeze(plan.launcherArgv);
    Object.freeze(plan.environment);
    for (const artifact of plan.artifacts) Object.freeze(artifact);
    Object.freeze(plan.artifacts);
    Object.freeze(plan.runtimeContract);
    Object.freeze(plan);
    admissions.set(plan, signal);
    return plan;
}

export function isAdmittedQualificationInvestigation(plan: AgentExecutionPlan, signal?: AbortSignal): boolean {
    return plan.qualificationInvestigation === true && signal !== undefined && admissions.get(plan) === signal
        && hasQualificationOperationPlan(plan, signal);
}
