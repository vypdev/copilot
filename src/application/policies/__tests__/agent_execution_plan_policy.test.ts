import { buildProviderExecutionPolicy } from '../agent_execution/agent_execution_policy_dispatcher';
import { buildCodexExecutionPolicy } from '../agent_execution/codex_execution_plan_policy';
import { buildOpenCodeExecutionPolicy } from '../agent_execution/opencode_execution_plan_policy';
import { buildCursorExecutionPolicy } from '../agent_execution/cursor_execution_plan_policy';
import type { AgentCapability, AgentProvider } from '../../../domain/agent';

const capabilities: readonly AgentCapability[] = ['planner', 'findings', 'reviewer', 'fixer', 'tester', 'language'];
const providers: readonly AgentProvider[] = ['codex', 'opencode', 'cursor'];

function build(provider: AgentProvider, capability: AgentCapability, structured = false) {
    return buildProviderExecutionPolicy({
        configuration: {
            provider,
            modelProvider: provider === 'cursor' ? 'cursor' : 'openai',
            model: 'model-1',
            effort: provider === 'cursor' ? undefined : 'high',
        },
        capability,
        workspace: '/workspace',
        runtimeDirectory: '/runtime',
        ...(structured ? { outputSchema: { type: 'object', properties: {}, additionalProperties: false } } : {}),
    });
}

describe('provider execution plan policy', () => {
    it.each(providers.flatMap(provider => capabilities.map(capability => [provider, capability] as const)))(
        'builds a complete fail-closed %s/%s policy',
        (provider, capability) => {
            const policy = build(provider, capability);
            expect(policy.workspaceMode).toBe(capability === 'fixer' ? 'workspace-write' : 'read-only');
            expect(policy.argv).not.toHaveLength(0);
            expect(policy.promptMode).toMatch(/^(stdin|final-argv)$/);
            expect(policy.outputProtocol).toBe(provider === 'opencode' ? 'json-lines-text-events' : 'plain-text');
            expect(policy.output).toBe('text');
        },
    );

    it('reconstructs the complete Codex authority and native schema argv', () => {
        const policy = build('codex', 'fixer', true);
        expect(policy.argv).toEqual(expect.arrayContaining([
            'exec', '--strict-config', '--ignore-user-config', '--ignore-rules', '--ephemeral',
            '--sandbox', 'workspace-write', '--model', 'model-1',
            '--config', 'approval_policy="never"', '--config', 'web_search="disabled"',
            '--config', 'features.multi_agent=false', '--config', 'history.persistence="none"',
            '--config', 'sandbox_workspace_write.network_access=false',
            '--output-schema', '/runtime/response.schema.json', '-',
        ]));
        expect(policy.argv.at(-1)).toBe('-');
        expect(policy.output).toBe('native-and-local-json-schema');
        expect(policy.artifacts).toHaveLength(1);
    });

    it('builds OpenCode default-deny permissions with fixer-only edit authority', () => {
        const readonly = build('opencode', 'reviewer');
        const fixer = build('opencode', 'fixer');
        const readonlyConfig = JSON.parse(readonly.environment.OPENCODE_CONFIG_CONTENT);
        const fixerConfig = JSON.parse(fixer.environment.OPENCODE_CONFIG_CONTENT);
        expect(readonly.argv).toEqual([
            'run', '--pure', '--agent', 'copilot-controlled-readonly', '--format', 'json',
            '--model', 'openai/model-1', '--variant', 'high',
        ]);
        expect(readonlyConfig.permission).toMatchObject({ '*': 'deny', edit: 'deny', bash: 'deny', lsp: 'deny', task: 'deny', skill: 'deny', webfetch: 'deny', websearch: 'deny' });
        expect(fixerConfig.permission).toMatchObject({ '*': 'deny', edit: 'allow', bash: 'deny' });
        expect(readonlyConfig.subagent_depth).toBe(0);
        expect(readonlyConfig).not.toHaveProperty('tools');
        expect(readonly.environment.OPENCODE_DISABLE_DEFAULT_PLUGINS).toBe('true');
    });

    it('builds Cursor isolated read/write sandboxes with no shell or network', () => {
        const readonly = build('cursor', 'tester');
        const fixer = build('cursor', 'fixer');
        const readonlyCli = JSON.parse(readonly.artifacts[0].contents);
        const readonlySandbox = JSON.parse(readonly.artifacts[1].contents);
        const fixerSandbox = JSON.parse(fixer.artifacts[1].contents);
        expect(readonly.argv).toEqual(['-p', '--output-format', 'text', '--sandbox', 'enabled', '--model', 'model-1', '--mode', 'ask']);
        expect(fixer.argv).toEqual(['-p', '--output-format', 'text', '--sandbox', 'enabled', '--model', 'model-1', '--force']);
        expect(readonlyCli.permissions.deny).toContain('Shell(*)');
        expect(readonlyCli.permissions.deny).toContain('WebFetch(*)');
        expect(readonlyCli.permissions.deny).toContain('Mcp(*:*)');
        expect(readonlyCli.permissions.deny).toContain('Write(**)');
        expect(JSON.parse(fixer.artifacts[0].contents).permissions.deny).not.toContain('Write(**)');
        expect(readonly.artifacts[1].path).toBe('/runtime/.cursor/sandbox.json');
        expect(readonlySandbox).toMatchObject({ type: 'workspace_readonly', disableTmpWrite: true, networkPolicy: { default: 'deny', allow: [], deny: [] } });
        expect(fixerSandbox.type).toBe('workspace_readwrite');
    });

    it.each(providers)('keeps structured output under local validation for %s', (provider) => {
        const policy = build(provider, 'findings', true);
        expect(policy.output).toBe(provider === 'codex' ? 'native-and-local-json-schema' : 'local-json-schema');
        expect(policy.artifacts.some(artifact => artifact.purpose === 'output-schema')).toBe(true);
    });

    it('rejects a provider-specific builder mismatch instead of accepting ambient input', () => {
        expect(() => buildProviderExecutionPolicy({
            configuration: { provider: 'unknown' as AgentProvider, model: 'model' },
            capability: 'findings', workspace: '/workspace', runtimeDirectory: '/runtime',
        })).toThrow('Unsupported agent provider');
        const base = { capability: 'findings' as const, workspace: '/workspace', runtimeDirectory: '/runtime' };
        expect(() => buildCodexExecutionPolicy({ ...base, configuration: { provider: 'cursor', model: 'model' } })).toThrow('Codex policy');
        expect(() => buildOpenCodeExecutionPolicy({ ...base, configuration: { provider: 'codex', model: 'model' } })).toThrow('OpenCode policy');
        expect(() => buildCursorExecutionPolicy({ ...base, configuration: { provider: 'opencode', model: 'model' } })).toThrow('Cursor policy');
    });

    it('uses provider-owned defaults when optional model provider and effort are absent', () => {
        const base = { capability: 'findings' as const, workspace: '/workspace', runtimeDirectory: '/runtime' };
        const codex = buildCodexExecutionPolicy({ ...base, configuration: { provider: 'codex', model: 'model' } });
        const opencode = buildOpenCodeExecutionPolicy({ ...base, configuration: { provider: 'opencode', model: 'model' } });
        expect(codex.argv).toContain('model_provider="openai"');
        expect(codex.argv).not.toContain('model_reasoning_effort');
        expect(opencode.argv).toContain('openai/model');
        expect(opencode.argv).not.toContain('--variant');
    });
});
