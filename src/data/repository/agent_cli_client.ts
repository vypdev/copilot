import type { AgentCliRequest } from './agent_cli_contracts';
import { runAgentCli } from './agent_cli_execution';
import { AgentExecutionPlanner } from '../../infrastructure/agents/agent_execution_planner';
import type { AgentExecutionPlan } from '../../domain/agent_execution_plan';
import type {
    AgentExecutionFailureCategory,
    AgentExecutionObservation,
    AgentExecutionObserverPort,
    AgentExecutionSemanticCode,
} from '../../application/ports/agent_execution_observation_ports';
import { AgentCliError } from './agent_cli_contracts';

export type { AgentCliRequest, AgentCliError } from './agent_cli_contracts';

export interface AgentExecutionPlanPort {
    prepare(request: AgentCliRequest): AgentExecutionPlan;
}

const NOOP_OBSERVER: AgentExecutionObserverPort = { observe: () => undefined };

export class AgentCliClient {
    constructor(
        private readonly planner: AgentExecutionPlanPort = new AgentExecutionPlanner(),
        private readonly observer: AgentExecutionObserverPort = NOOP_OBSERVER,
    ) {}

    async execute(request: AgentCliRequest): Promise<string> {
        const startedAt = Date.now();
        observeSafely(this.observer, {
            state: 'started', phase: 'plan',
            provider: request.configuration.provider, capability: request.capability,
        });
        let plan: AgentExecutionPlan;
        try {
            plan = this.planner.prepare(request);
        } catch (error) {
            observeSafely(this.observer, failureObservation(request, error, 'preflight', startedAt));
            throw error;
        }
        observeSafely(this.observer, {
            state: 'admitted', phase: 'preflight',
            provider: plan.provider, capability: plan.capability,
            durationMilliseconds: Date.now() - startedAt,
            manifestRevision: plan.runtimeContract.manifestRevision,
            version: plan.runtimeContract.version,
            workspaceMode: plan.workspaceMode,
            outputContract: plan.output,
            artifactHashes: plan.artifacts.map(artifact => artifact.sha256),
        });
        const runStartedAt = Date.now();
        try {
            const output = await runAgentCli(plan, request.prompt, request.signal);
            observeSafely(this.observer, {
                state: 'completed', phase: 'run', provider: plan.provider, capability: plan.capability,
                durationMilliseconds: Date.now() - runStartedAt,
                outputBytes: Buffer.byteLength(output, 'utf8'),
            });
            return output;
        } catch (error) {
            observeSafely(this.observer, failureObservation(request, error, 'run', runStartedAt));
            throw error;
        }
    }
}

function failureObservation(
    request: Pick<AgentCliRequest, 'configuration' | 'capability'>,
    error: unknown,
    phase: 'preflight' | 'run',
    startedAt: number,
): AgentExecutionObservation {
    const category: AgentExecutionFailureCategory = error instanceof AgentCliError
        ? error.category
        : phase === 'preflight' ? 'configuration' : 'process';
    return {
        state: 'failed', phase,
        provider: request.configuration.provider, capability: request.capability,
        durationMilliseconds: Date.now() - startedAt,
        failureCategory: category,
        semanticCode: semanticCodeForFailure(category),
        retryable: error instanceof AgentCliError && error.retryable,
    };
}

function semanticCodeForFailure(category: AgentExecutionFailureCategory): AgentExecutionSemanticCode {
    if (category === 'configuration') return 'agent.policy-rejected';
    if (category === 'timeout') return 'timeout';
    if (category === 'cancelled') return 'workflow.cancelled';
    if (category === 'output') return 'provider.contract-invalid';
    return 'agent.failed';
}

function observeSafely(observer: AgentExecutionObserverPort, observation: AgentExecutionObservation): void {
    try {
        observer.observe(observation);
    } catch {
        // Telemetry must never alter execution or failure semantics.
    }
}
