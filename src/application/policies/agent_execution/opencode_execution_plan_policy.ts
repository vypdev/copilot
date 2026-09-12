import { workspaceModeForCapability } from '../../../domain/agent_execution_plan';
import {
    managedArtifactPath,
    type ProviderExecutionPolicy,
    type ProviderExecutionPolicyInput,
} from './provider_execution_policy';

const READONLY_AGENT = 'copilot-controlled-readonly';
const FIXER_AGENT = 'copilot-controlled-fixer';

export function buildOpenCodeExecutionPolicy(input: ProviderExecutionPolicyInput): ProviderExecutionPolicy {
    const { configuration } = input;
    if (configuration.provider !== 'opencode') throw new Error('OpenCode policy requires OpenCode configuration.');
    const workspaceMode = workspaceModeForCapability(input.capability);
    const fixer = workspaceMode === 'workspace-write';
    const agentName = fixer ? FIXER_AGENT : READONLY_AGENT;
    const permission = {
        '*': 'deny',
        read: 'allow',
        glob: 'allow',
        grep: 'allow',
        list: 'allow',
        lsp: 'deny',
        edit: fixer ? 'allow' : 'deny',
        bash: 'deny',
        webfetch: 'deny',
        websearch: 'deny',
        task: 'deny',
        skill: 'deny',
        question: 'deny',
        external_directory: 'deny',
    } as const;
    const configDirectory = managedArtifactPath(input.runtimeDirectory, 'opencode');
    const configPath = managedArtifactPath(configDirectory, 'opencode.json');
    const config = {
        $schema: 'https://opencode.ai/config.json',
        autoupdate: false,
        share: 'disabled',
        plugin: [],
        mcp: {},
        instructions: [],
        command: {},
        lsp: false,
        snapshot: false,
        subagent_depth: 0,
        permission,
        default_agent: agentName,
        enabled_providers: [configuration.modelProvider || 'openai'],
        agent: {
            [agentName]: {
                description: 'Controlled non-interactive repository automation agent.',
                mode: 'primary',
                permission,
            },
        },
    };
    const artifacts = [{
        path: configPath,
        contents: JSON.stringify(config),
        purpose: 'provider-config' as const,
    }, ...(input.outputSchema ? [{
        path: managedArtifactPath(input.runtimeDirectory, 'response.schema.json'),
        contents: JSON.stringify(input.outputSchema),
        purpose: 'output-schema' as const,
    }] : [])];
    return {
        argv: [
            'run', '--pure', '--agent', agentName, '--format', 'json',
            '--model', `${configuration.modelProvider || 'openai'}/${configuration.model}`,
            ...(configuration.effort ? ['--variant', configuration.effort] : []),
        ],
        promptMode: 'final-argv',
        outputProtocol: 'json-lines-text-events',
        workspaceMode,
        output: input.outputSchema ? 'local-json-schema' : 'text',
        environment: {
            OPENCODE_CONFIG: configPath,
            OPENCODE_CONFIG_DIR: configDirectory,
            OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
            OPENCODE_PERMISSION: JSON.stringify(permission),
            OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
            OPENCODE_DISABLE_AUTOUPDATE: 'true',
            OPENCODE_DISABLE_LSP_DOWNLOAD: 'true',
            OPENCODE_DISABLE_CLAUDE_CODE: 'true',
            OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: 'true',
            OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: 'true',
            OPENCODE_ENABLE_EXA: 'false',
            OPENCODE_ENABLE_PARALLEL: 'false',
        },
        artifacts,
    };
}
