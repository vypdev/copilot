import { enforceAgentExecutionPolicy } from '../agent_execution_policy';

describe('enforceAgentExecutionPolicy', () => {
    it('forces non-mutating Codex capabilities into a read-only sandbox', () => {
        const args = enforceAgentExecutionPolicy('codex', 'reviewer', ['exec', '--model', 'gpt-5', '-']);
        expect(args).toEqual(expect.arrayContaining([
            '--sandbox', 'read-only', '--strict-config', '--ignore-user-config', '--ignore-rules', '--ephemeral',
            'approval_policy=never', 'sandbox_workspace_write.network_access=false',
            'sandbox_workspace_write.exclude_slash_tmp=true', 'allow_login_shell=false', 'web_search=disabled',
            'tools.web_search=false', 'project_doc_max_bytes=0', 'shell_environment_policy.ignore_default_excludes=false',
        ]));
        expect(args.at(-1)).toBe('-');
    });

    it('allows only workspace writes for the fixer capability', () => {
        expect(enforceAgentExecutionPolicy('codex', 'fixer', ['exec', '--model', 'gpt-5', '-']))
            .toEqual(expect.arrayContaining(['--sandbox', 'workspace-write', 'sandbox_workspace_write.network_access=false']));
    });

    it('injects only the managed Codex output schema path', () => {
        const args = enforceAgentExecutionPolicy(
            'codex',
            'findings',
            ['exec', '--model', 'gpt-5', '-'],
            '/private/runtime/response.schema.json',
        );
        expect(args).toEqual(expect.arrayContaining([
            '--output-schema', '/private/runtime/response.schema.json',
        ]));
        expect(args.at(-1)).toBe('-');
        expect(() => enforceAgentExecutionPolicy(
            'codex',
            'findings',
            ['exec', '--output-schema', './repository-schema.json', '-'],
        )).toThrow('runtime flags are not allowed');
    });

    it('rejects mismatched and bypassed sandbox policies', () => {
        expect(() => enforceAgentExecutionPolicy('codex', 'reviewer', ['exec', '--sandbox', 'workspace-write', '-']))
            .toThrow('requires the read-only sandbox');
        expect(() => enforceAgentExecutionPolicy('codex', 'fixer', ['exec', '--dangerously-bypass-approvals-and-sandbox', '-']))
            .toThrow('runtime flags are not allowed');
        expect(() => enforceAgentExecutionPolicy('codex', 'fixer', ['exec', '--config', 'sandbox_workspace_write.network_access=true', '-']))
            .toThrow('network_access must be false');
        expect(() => enforceAgentExecutionPolicy('codex', 'reviewer', ['exec', '--config=approval_policy=on-request', '-']))
            .toThrow('approval_policy must be never');
        expect(() => enforceAgentExecutionPolicy('codex', 'reviewer', ['exec', '--config=sandbox_mode=workspace-write', '-']))
            .toThrow('sandbox_mode must be read-only');
        expect(() => enforceAgentExecutionPolicy('codex', 'reviewer', ['exec', '--search', '-']))
            .toThrow('runtime flags are not allowed');
        expect(() => enforceAgentExecutionPolicy('codex', 'reviewer', ['exec', '--config', 'hooks.Stop=[]', '-']))
            .toThrow('hooks.Stop is not allowed');
        expect(() => enforceAgentExecutionPolicy('codex', 'reviewer', ['exec', '-cweb_search=live', '-']))
            .toThrow('web_search must be disabled');
    });

    it('uses read-only mode and sandboxing for Cursor analysis but permits sandboxed fixer writes', () => {
        expect(enforceAgentExecutionPolicy('cursor', 'reviewer', ['-p']))
            .toEqual(expect.arrayContaining(['--sandbox', 'enabled', '--mode', 'ask']));
        expect(enforceAgentExecutionPolicy('cursor', 'fixer', ['-p']))
            .toEqual(expect.arrayContaining(['--sandbox', 'enabled', '--force']));
        expect(() => enforceAgentExecutionPolicy('cursor', 'reviewer', ['-p', '--yolo']))
            .toThrow('is not allowed');
        expect(() => enforceAgentExecutionPolicy('cursor', 'reviewer', ['-p', '--force']))
            .toThrow('cannot force tool approval');
    });

    it('disables OpenCode plugins and selects controlled capability agents', () => {
        expect(enforceAgentExecutionPolicy('opencode', 'findings', ['run', '--model', 'openai/model']))
            .toEqual(expect.arrayContaining(['--pure', '--agent', 'copilot-controlled-readonly']));
        expect(enforceAgentExecutionPolicy('opencode', 'fixer', ['run']))
            .toEqual(expect.arrayContaining(['--pure', '--agent', 'copilot-controlled-fixer']));
        expect(() => enforceAgentExecutionPolicy('opencode', 'findings', ['run', '--share']))
            .toThrow('is not allowed');
        expect(() => enforceAgentExecutionPolicy('opencode', 'fixer', ['run', '--agent', 'build']))
            .toThrow('requires the copilot-controlled-fixer agent');
    });

    it('preserves already compliant runtime controls without duplicating them', () => {
        expect(enforceAgentExecutionPolicy(undefined, 'reviewer', ['custom'])).toEqual(['custom']);
        expect(enforceAgentExecutionPolicy('codex', undefined, ['exec', '-'])).toEqual(['exec', '-']);

        const codex = enforceAgentExecutionPolicy('codex', 'reviewer', [
            'exec',
            '-sread-only',
            '-anever',
            '--strict-config',
            '--ignore-user-config',
            '--ignore-rules',
            '--ephemeral',
            '--config',
            'approval_policy="never"',
            '-',
        ]);
        expect(codex.filter((value) => value === '--strict-config')).toHaveLength(1);
        expect(codex.at(-1)).toBe('-');

        expect(enforceAgentExecutionPolicy('cursor', 'reviewer', ['-p', '--sandbox=enabled', '--plan']))
            .toEqual(['-p', '--sandbox=enabled', '--plan']);
        expect(enforceAgentExecutionPolicy('cursor', 'fixer', ['-p', '-f']))
            .toEqual(expect.arrayContaining(['-f', '--sandbox', 'enabled']));
        expect(enforceAgentExecutionPolicy('opencode', 'findings', [
            'run', '--pure', '--agent=copilot-controlled-readonly',
        ])).toEqual(['run', '--pure', '--agent=copilot-controlled-readonly']);
    });

    it('rejects invalid Cursor sandbox and read-only mode overrides', () => {
        expect(() => enforceAgentExecutionPolicy('cursor', 'reviewer', ['-p', '--sandbox=unrestricted']))
            .toThrow('sandbox to be enabled');
        expect(() => enforceAgentExecutionPolicy('cursor', 'reviewer', ['-p', '--mode=agent']))
            .toThrow('requires ask or plan mode');
    });
});
