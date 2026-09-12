import type { AgentProvider } from '../../../domain/agent';
import { buildCodexExecutionPolicy } from './codex_execution_plan_policy';
import { buildCursorExecutionPolicy } from './cursor_execution_plan_policy';
import { buildOpenCodeExecutionPolicy } from './opencode_execution_plan_policy';
import { assertNever, type ProviderExecutionPolicy, type ProviderExecutionPolicyInput } from './provider_execution_policy';

/** Static exhaustive dispatch: providers cannot register or bypass policy at runtime. */
export function buildProviderExecutionPolicy(input: ProviderExecutionPolicyInput): ProviderExecutionPolicy {
    const provider: AgentProvider = input.configuration.provider;
    switch (provider) {
        case 'codex': return buildCodexExecutionPolicy(input);
        case 'opencode': return buildOpenCodeExecutionPolicy(input);
        case 'cursor': return buildCursorExecutionPolicy(input);
    }
    return assertNever(provider);
}
