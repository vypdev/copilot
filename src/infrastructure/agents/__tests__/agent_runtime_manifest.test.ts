import { AGENT_EXECUTABLE_BASENAMES } from '../../../domain/agent';
import {
    assertInstalledAgentRuntimeVersion,
    getAgentRuntimeManifest,
    readAgentRuntimeVersion,
} from '../agent_runtime_manifest';

describe('agent runtime manifest', () => {
    it('separates reviewed runtime identity from reproducible package installation', () => {
        const manifest = getAgentRuntimeManifest();
        expect(manifest.revision).toBe('2026-09-12.p1-c.2');
        expect(manifest.providers).toEqual({
            codex: {
                executable: 'codex',
                reviewedVersion: 'codex-cli 0.153.4',
                installation: { package: '@openai/codex', version: '0.153.4' },
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

    it.each([
        ['codex', 'codex-cli 0.153.4\n'],
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
