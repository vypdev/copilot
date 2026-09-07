import { existsSync, readFileSync } from 'node:fs';
import { prepareAgentRuntimeEnvironment } from '../agent_runtime_environment';

describe('prepareAgentRuntimeEnvironment', () => {
    it('gives OpenCode analysis an inline deny-by-default policy', () => {
        const runtime = prepareAgentRuntimeEnvironment('opencode', 'reviewer', { PATH: '/usr/bin', OPENAI_API_KEY: 'key' }, 'openai');
        const permission = JSON.parse(runtime.environment.OPENCODE_PERMISSION ?? '{}');
        const config = JSON.parse(runtime.environment.OPENCODE_CONFIG_CONTENT ?? '{}');
        expect(permission).toMatchObject({ '*': 'deny', read: 'allow', edit: 'deny', bash: 'deny', webfetch: 'deny' });
        expect(config.agent['copilot-controlled-readonly'].permission).toEqual(permission);
        expect(runtime.environment.OPENAI_API_KEY).toBe('key');
    });

    it('allows only the OpenCode edit tool for the fixer mutation surface', () => {
        const runtime = prepareAgentRuntimeEnvironment('opencode', 'fixer', {}, 'ollama');
        expect(JSON.parse(runtime.environment.OPENCODE_PERMISSION ?? '{}')).toMatchObject({
            '*': 'deny', edit: 'allow', bash: 'deny', task: 'deny', external_directory: 'deny',
        });
    });

    it('creates and removes an isolated Cursor sandbox configuration', () => {
        const runtime = prepareAgentRuntimeEnvironment('cursor', 'fixer', { CURSOR_API_KEY: 'key', PATH: '/usr/bin' });
        const home = runtime.environment.HOME!;
        const configDirectory = runtime.environment.CURSOR_CONFIG_DIR!;
        expect(runtime.environment.CURSOR_API_KEY).toBe('key');
        expect(configDirectory).toBe(`${home}/.cursor`);
        expect(JSON.parse(readFileSync(`${configDirectory}/sandbox.json`, 'utf8'))).toMatchObject({
            type: 'workspace_readwrite',
            disableTmpWrite: true,
            networkPolicy: { default: 'deny', allow: [], deny: [] },
        });
        runtime.cleanup();
        expect(existsSync(home)).toBe(false);
    });
});
