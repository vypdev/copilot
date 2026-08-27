import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentCliClient } from '../agent_cli_client';

describe('AgentCliClient fake executable contract', () => {
    let directory: string;
    let executable: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'copilot-agent-cli-'));
        executable = join(directory, 'fake-agent');
        await writeFile(executable, '#!/bin/sh\ncat\n');
        await chmod(executable, 0o755);
    });

    afterEach(async () => rm(directory, { recursive: true, force: true }));

    it('executes an isolated fake provider and returns the prompt', async () => {
        await expect(new AgentCliClient().execute({ command: executable, prompt: 'contract-prompt', timeoutMs: 1000 })).resolves.toBe('contract-prompt');
    });

    it('enforces the timeout against a fake provider', async () => {
        await writeFile(executable, `#!${process.execPath}\nsetTimeout(() => {}, 2000);\n`);
        await chmod(executable, 0o755);
        await expect(new AgentCliClient().execute({ command: executable, prompt: 'contract-prompt', timeoutMs: 20 })).rejects.toMatchObject({ category: 'timeout' });
    });
});
