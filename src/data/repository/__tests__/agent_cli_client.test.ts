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

    it('classifies a missing executable as a process error', async () => {
        await expect(new AgentCliClient().execute({ command: 'missing-agent-binary', prompt: 'prompt', timeoutMs: 2000 })).rejects.toMatchObject({ category: 'process' });
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
});
