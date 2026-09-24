import { AGENT_EXECUTABLE_BASENAMES } from '../../../domain/agent';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    assertInstalledAgentRuntimeVersion,
    getAgentRuntimeManifest,
    readAgentRuntimeVersion,
} from '../agent_runtime_manifest';

describe('agent runtime manifest', () => {
    it('separates reviewed runtime identity from reproducible package installation', () => {
        const manifest = getAgentRuntimeManifest();
        expect(manifest.revision).toBe('2026-09-24.p1-c.3');
        expect(manifest.providers).toEqual({
            codex: {
                executable: 'codex',
                reviewedVersion: 'codex-cli 0.156.1',
                installation: { package: '@openai/codex', version: '0.156.1' },
            },
            opencode: {
                executable: 'opencode',
                reviewedVersion: '1.18.3',
                installation: { package: 'opencode-ai', version: '1.18.3' },
            },
            cursor: { executable: 'agent', reviewedVersion: '2026.09.10-fd3934a' },
        });
        expect(Object.fromEntries(Object.entries(manifest.providers).map(([provider, entry]) => [provider, entry.executable]))).toEqual(AGENT_EXECUTABLE_BASENAMES);
    });

    it.each(['codex', 'opencode'] as const)('keeps the %s workflow installer synchronized with the runtime manifest', (provider) => {
        const workflow = readFileSync(join(process.cwd(), 'setup/workflows/agent-cli-provisioning.yml'), 'utf8');
        const entry = getAgentRuntimeManifest().providers[provider];
        expect(entry.installation).toBeDefined();
        const expectedVersion = provider === 'codex' ? `'${entry.reviewedVersion}'` : entry.reviewedVersion;
        expect(workflow).toContain(`${provider}) expected_executable=${entry.executable}; expected_version=${expectedVersion}`);
        expect(workflow).toContain(`${provider}) npm install --global '${entry.installation!.package}@${entry.installation!.version}'`);
    });

    it.each([
        ['codex', 'codex-cli 0.156.1\n'],
        ['opencode', '1.18.3'],
        ['cursor', '2026.09.10-fd3934a\r\n'],
    ] as const)('verifies an exact %s version after Copilot installs it', (provider, output) => {
        expect(assertInstalledAgentRuntimeVersion(provider, output)).toBe(output.trim());
    });

    it.each([
        ['codex', 'codex-cli 0.153.5'], ['opencode', 'v1.18.3'], ['cursor', '2026.09.11-new'],
    ] as const)('rejects a mismatched Copilot-installed %s runtime', (provider, output) => {
        expect(() => assertInstalledAgentRuntimeVersion(provider, output)).toThrow('version mismatch');
    });

    it('records any non-empty operator-owned runtime version and rejects empty output', () => {
        expect(readAgentRuntimeVersion('codex', 'codex-cli 0.154.0\n')).toBe('codex-cli 0.154.0');
        expect(() => readAgentRuntimeVersion('codex', '  \n')).toThrow('empty version output');
    });
});
