import { workspaceModeForCapability } from '../../../domain/agent_execution_plan';
import {
    managedArtifactPath,
    type ProviderExecutionPolicy,
    type ProviderExecutionPolicyInput,
} from './provider_execution_policy';

export function buildCodexExecutionPolicy(input: ProviderExecutionPolicyInput): ProviderExecutionPolicy {
    const { configuration } = input;
    if (configuration.provider !== 'codex') throw new Error('Codex policy requires Codex configuration.');
    const workspaceMode = workspaceModeForCapability(input.capability);
    const outputSchemaPath = input.outputSchema
        ? managedArtifactPath(input.runtimeDirectory, 'response.schema.json')
        : undefined;
    const artifacts = outputSchemaPath ? [{
        path: outputSchemaPath,
        contents: JSON.stringify(input.outputSchema),
        purpose: 'output-schema' as const,
    }] : [];
    const argv = [
        'exec',
        '--strict-config',
        '--ignore-user-config',
        '--ignore-rules',
        '--ephemeral',
        '--sandbox', workspaceMode,
        '--model', configuration.model,
        '--config', `model_provider=${tomlString(configuration.modelProvider || 'openai')}`,
        '--config', 'approval_policy="never"',
        '--config', 'web_search="disabled"',
        '--config', 'features.multi_agent=false',
        '--config', 'features.skill_mcp_dependency_install=false',
        '--config', 'history.persistence="none"',
        '--config', 'sandbox_workspace_write.network_access=false',
        '--config', 'sandbox_workspace_write.exclude_slash_tmp=true',
        '--config', 'sandbox_workspace_write.exclude_tmpdir_env_var=true',
        '--config', 'sandbox_workspace_write.writable_roots=[]',
        '--config', 'allow_login_shell=false',
        '--config', 'shell_environment_policy.inherit="none"',
        '--config', 'project_doc_max_bytes=0',
        '--config', 'mcp_servers={}',
        '--config', 'hooks={}',
        '--config', 'analytics.enabled=false',
        ...(configuration.effort ? ['--config', `model_reasoning_effort=${tomlString(configuration.effort)}`] : []),
        ...(outputSchemaPath ? ['--output-schema', outputSchemaPath] : []),
        '-',
    ];
    return {
        argv,
        promptMode: 'stdin',
        outputProtocol: 'plain-text',
        workspaceMode,
        output: outputSchemaPath ? 'native-and-local-json-schema' : 'text',
        environment: {},
        artifacts,
    };
}

function tomlString(value: string): string {
    return JSON.stringify(value);
}
