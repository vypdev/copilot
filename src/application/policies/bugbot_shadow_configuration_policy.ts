import type { AgentConfiguration } from '../../domain/agent';
import type { BugbotShadowConfiguration } from '../../domain/bugbot/review_configuration';
import { INPUT_KEYS } from '../contracts/input_keys';
import { ApplicationError } from '../errors/application_error';
import type { AgentConfigurationEnvironment } from '../ports/agent_configuration_ports';
import { buildAgentConfiguration } from './agent_configuration_input_policy';
import { resolveAgentProvider, resolveEffort, resolveModel } from './agent_configuration_validation_policy';

export function readBugbotVerificationMode(read: (input: string) => string): 'disabled' | 'shadow' {
    const mode = read(INPUT_KEYS.BUGBOT_VERIFICATION_MODE)?.trim() || 'disabled';
    if (mode === 'enforced') {
        throw new ApplicationError('configuration.unsupported', 'Bugbot enforcement requires a qualified verification profile. Use shadow for evaluation.');
    }
    if (mode !== 'shadow' && mode !== 'disabled') {
        throw new ApplicationError('configuration.invalid', 'Bugbot verification mode must be disabled or shadow.');
    }
    return mode;
}

export function readBugbotShadowConfiguration(
    read: (input: string) => string,
    environment: AgentConfigurationEnvironment,
): BugbotShadowConfiguration | undefined {
    if (readBugbotVerificationMode(read) === 'disabled') return undefined;
    const provider = read(INPUT_KEYS.BUGBOT_VERIFIER_PROVIDER)?.trim().toLowerCase();
    const modelProvider = read(INPUT_KEYS.BUGBOT_VERIFIER_MODEL_PROVIDER)?.trim().toLowerCase();
    const model = read(INPUT_KEYS.BUGBOT_VERIFIER_MODEL)?.trim();
    const effort = resolveEffort(read(INPUT_KEYS.BUGBOT_VERIFIER_EFFORT));
    return Object.freeze({
        ...(provider ? { provider: resolveAgentProvider(provider) } : {}),
        ...(modelProvider ? { modelProvider } : {}),
        ...(model ? { model: resolveModel(model) } : {}),
        ...(effort ? { effort } : {}),
        ...(environment.AGENT_ALLOWED_MODEL_PROVIDERS ? { allowedModelProviders: environment.AGENT_ALLOWED_MODEL_PROVIDERS } : {}),
        ...(environment.AGENT_ALLOWED_MODELS ? { allowedModels: environment.AGENT_ALLOWED_MODELS } : {}),
    });
}

export function resolveBugbotShadowConfiguration(
    detector: Readonly<AgentConfiguration>,
    overrides: BugbotShadowConfiguration,
): Readonly<AgentConfiguration> {
    const provider = overrides.provider ?? detector.provider;
    const newAgent = provider !== detector.provider;
    const modelProvider = overrides.modelProvider ?? (newAgent ? undefined : detector.modelProvider);
    const newBackend = newAgent || modelProvider !== detector.modelProvider;
    if (newBackend && !overrides.model) {
        throw new ApplicationError('configuration.invalid', 'Changing the Bugbot verifier provider requires an explicit compatible model.');
    }
    if (provider === 'cursor' && overrides.effort) {
        throw new ApplicationError('configuration.unsupported', 'Cursor verification uses a catalog model ID for reasoning variants. Leave verifier effort empty.');
    }
    const effort = provider === 'cursor' ? undefined : overrides.effort ?? (newBackend ? undefined : detector.effort);
    if (provider === 'codex' && effort && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(effort)) {
        throw new ApplicationError('configuration.unsupported', 'Unsupported Codex verifier reasoning effort.');
    }
    return Object.freeze(buildAgentConfiguration({
        provider, modelProvider, model: overrides.model ?? detector.model, effort,
        executable: newAgent ? undefined : detector.executable,
    }, {
        AGENT_ALLOWED_MODEL_PROVIDERS: overrides.allowedModelProviders,
        AGENT_ALLOWED_MODELS: overrides.allowedModels,
    }));
}
