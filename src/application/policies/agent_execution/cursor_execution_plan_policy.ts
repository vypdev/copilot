import { workspaceModeForCapability } from '../../../domain/agent_execution_plan';
import {
    managedArtifactPath,
    type ProviderExecutionPolicy,
    type ProviderExecutionPolicyInput,
} from './provider_execution_policy';

export function buildCursorExecutionPolicy(input: ProviderExecutionPolicyInput): ProviderExecutionPolicy {
    const { configuration } = input;
    if (configuration.provider !== 'cursor') throw new Error('Cursor policy requires Cursor configuration.');
    const workspaceMode = workspaceModeForCapability(input.capability);
    const fixer = workspaceMode === 'workspace-write';
    const configDirectory = managedArtifactPath(input.runtimeDirectory, 'cursor');
    const cliConfigPath = managedArtifactPath(configDirectory, 'cli-config.json');
    const sandboxPath = managedArtifactPath(input.runtimeDirectory, '.cursor/sandbox.json');
    const cliConfig = {
        version: 1,
        editor: { vimMode: false },
        approvalMode: 'allowlist',
        permissions: {
            allow: fixer ? ['Read(**)', 'Write(**)'] : ['Read(**)'],
            deny: [
                'Shell(*)', 'WebFetch(*)', 'Mcp(*:*)',
                'Read(.env*)', 'Read(**/.env*)', 'Read(**/.git/**)',
                ...(fixer ? [] : ['Write(**)']),
                'Write(.env*)', 'Write(**/.env*)',
                'Write(.git/**)', 'Write(**/.git/**)',
            ],
        },
        sandbox: { mode: 'enabled', networkAccess: 'deny' },
        notifications: false,
        suggestNextPrompt: false,
        attribution: { attributeCommitsToAgent: false, attributePRsToAgent: false },
    };
    const sandbox = {
        type: fixer ? 'workspace_readwrite' : 'workspace_readonly',
        additionalReadwritePaths: [],
        additionalReadonlyPaths: [],
        disableTmpWrite: true,
        enableSharedBuildCache: false,
        networkPolicyStrict: true,
        networkPolicy: { default: 'deny', allow: [], deny: [] },
    };
    const artifacts = [
        { path: cliConfigPath, contents: JSON.stringify(cliConfig), purpose: 'provider-config' as const },
        { path: sandboxPath, contents: JSON.stringify(sandbox), purpose: 'sandbox-config' as const },
        ...(input.outputSchema ? [{
            path: managedArtifactPath(input.runtimeDirectory, 'response.schema.json'),
            contents: JSON.stringify(input.outputSchema),
            purpose: 'output-schema' as const,
        }] : []),
    ];
    return {
        argv: [
            '-p', '--output-format', 'text', '--sandbox', 'enabled', '--model', configuration.model,
            ...(fixer ? ['--force'] : ['--mode', 'ask']),
        ],
        promptMode: 'final-argv',
        outputProtocol: 'plain-text',
        workspaceMode,
        output: input.outputSchema ? 'local-json-schema' : 'text',
        environment: {
            CURSOR_CONFIG_DIR: configDirectory,
            HOME: input.runtimeDirectory,
        },
        artifacts,
    };
}
