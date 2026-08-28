import type { AgentConfiguration } from './agent';

function quote(value: string): string {
    if (/^[a-zA-Z0-9._:/-]+$/.test(value)) return value;
    return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Build the provider-specific, non-interactive command for an agent task. */
export function defaultAgentCommand(configuration: Pick<AgentConfiguration, 'provider' | 'modelProvider' | 'model' | 'effort'>): string {
    const model = configuration.model.trim();
    const modelProvider = configuration.modelProvider?.trim() || 'openai';
    const effort = configuration.effort?.trim();

    switch (configuration.provider) {
        case 'codex': {
            const parts = [
                'codex exec',
                '--ephemeral',
                '--skip-git-repo-check',
                '--model',
                quote(model),
                '--config',
                quote(`model_provider="${modelProvider}"`),
            ];
            if (effort) parts.push('--config', quote(`model_reasoning_effort="${effort}"`));
            parts.push('-');
            return parts.join(' ');
        }
        case 'cursor':
            return ['agent', '-p', '--output-format', 'text', '--model', quote(model)].join(' ');
        case 'opencode': {
            const parts = ['opencode', 'run', '--model', quote(`${modelProvider}/${model}`)];
            if (effort) parts.push('--variant', quote(effort));
            return parts.join(' ');
        }
    }
}
