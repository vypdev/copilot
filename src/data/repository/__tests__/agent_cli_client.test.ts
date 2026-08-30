import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentCliClient } from '../agent_cli_client';

describe('AgentCliClient', () => {
    it('passes the normalized prompt to a CLI process and returns stdout', async () => {
        const script = "process.stdin.on('data', d => process.stdout.write('agent:' + d.toString()))";
        const output = await new AgentCliClient().execute({
            command: `${process.execPath} -e ${JSON.stringify(script)}`,
            prompt: 'find issues',
            timeoutMs: 2000,
        });

        expect(output).toBe('agent:find issues');
    });

    it('passes the prompt as one argument when the runtime requires argv transport', async () => {
        const script = "process.stdout.write(process.argv[1])";
        const output = await new AgentCliClient().execute({
            command: `${process.execPath} -e ${JSON.stringify(script)}`,
            prompt: 'find issues with spaces',
            promptMode: 'argv',
            timeoutMs: 2000,
        });

        expect(output).toBe('find issues with spaces');
    });

    it('does not pass exported Codex credentials to a locally authenticated CLI', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-codex-cli-env-test-'));
        try {
            writeFileSync(join(directory, 'auth.json'), JSON.stringify({
                auth_mode: 'chatgpt',
                OPENAI_API_KEY: null,
                tokens: { access_token: 'access', refresh_token: 'refresh' },
            }));
            const script = "process.stdout.write(JSON.stringify({ openai: process.env.OPENAI_API_KEY ?? null, codex: process.env.CODEX_ACCESS_TOKEN ?? null }))";
            const output = await new AgentCliClient().execute({
                command: `${process.execPath} -e ${JSON.stringify(script)}`,
                prompt: 'ignored',
                provider: 'codex',
                environment: {
                    CODEX_HOME: directory,
                    OPENAI_API_KEY: 'api-key-that-must-not-be-used',
                    CODEX_ACCESS_TOKEN: 'token-that-must-not-be-used',
                },
                timeoutMs: 2000,
            });

            expect(JSON.parse(output)).toEqual({ openai: null, codex: null });
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('passes Cursor credentials only to the Cursor CLI', async () => {
        const script = "process.stdout.write(JSON.stringify({ cursor: process.env.CURSOR_API_KEY ?? null, openai: process.env.OPENAI_API_KEY ?? null, opencode: process.env.OPENCODE_API_KEY ?? null }))";
        const output = await new AgentCliClient().execute({
            command: `${process.execPath} -e ${JSON.stringify(script)}`,
            prompt: 'ignored',
            provider: 'cursor',
            environment: {
                CURSOR_API_KEY: 'enterprise-key',
                OPENAI_API_KEY: 'api-key-that-must-not-be-used',
                OPENCODE_API_KEY: 'opencode-key-that-must-not-be-used',
            },
            timeoutMs: 2000,
        });

        expect(JSON.parse(output)).toEqual({ cursor: 'enterprise-key', openai: null, opencode: null });
    });

    it('classifies a missing executable as a process error', async () => {
        await expect(new AgentCliClient().execute({ command: 'missing-agent-binary', prompt: 'prompt', timeoutMs: 2000 })).rejects.toMatchObject({ category: 'process' });
    });

    it('does not include provider stderr in process errors', async () => {
        const script = "process.stderr.write('TOP_SECRET_PROVIDER_DIAGNOSTIC'); process.exit(7)";
        await expect(new AgentCliClient().execute({
            command: `${process.execPath} -e ${JSON.stringify(script)}`,
            prompt: 'ignored',
            timeoutMs: 2000,
        })).rejects.toMatchObject({
            category: 'process',
            message: expect.not.stringContaining('TOP_SECRET_PROVIDER_DIAGNOSTIC'),
        });
    });

    it('rejects output above the configured limit and terminates the process', async () => {
        const script = "process.stdout.write('0123456789')";
        await expect(new AgentCliClient().execute({ command: `${process.execPath} -e ${JSON.stringify(script)}`, prompt: 'ignored', timeoutMs: 5000, maxOutputBytes: 4 })).rejects.toMatchObject({ category: 'output' });
    });
    it('honors caller cancellation', async () => {
        const controller = new AbortController();
        const pending = new AgentCliClient().execute({ command: `${process.execPath} -e ${JSON.stringify('setTimeout(() => {}, 5000)')}`, prompt: 'prompt', timeoutMs: 5000, signal: controller.signal });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ category: 'cancelled' });
    });

    it('rejects invalid resource limits before spawning a process', async () => {
        await expect(new AgentCliClient().execute({ command: 'agent', prompt: 'prompt', timeoutMs: 0 })).rejects.toMatchObject({ category: 'configuration' });
        await expect(new AgentCliClient().execute({ command: 'agent', prompt: 'prompt', timeoutMs: 1000, maxOutputBytes: 0 })).rejects.toMatchObject({ category: 'configuration' });
    });
});
