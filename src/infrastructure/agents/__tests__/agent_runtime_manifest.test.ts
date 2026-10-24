import { AGENT_EXECUTABLE_BASENAMES } from '../../../domain/agent';
import { getAgentRuntimeManifest, readAgentRuntimeVersion } from '../agent_runtime_manifest';

describe('agent runtime manifest', () => {
    it('records official standalone sources for every provider without package-manager recipes', () => {
        const manifest = getAgentRuntimeManifest();
        expect(manifest.revision).toBe('2026-10-24.standalone.2');
        expect(Object.fromEntries(Object.entries(manifest.providers).map(([provider, entry]) => [provider, entry.executable])))
            .toEqual(AGENT_EXECUTABLE_BASENAMES);
        expect(manifest.providers.codex.installation).toEqual({
            unixScript: 'https://chatgpt.com/codex/install.sh',
            windowsScript: 'https://chatgpt.com/codex/install.ps1',
            scriptRecovery: {
                unix: {
                    url: 'https://raw.githubusercontent.com/openai/codex/b412ff32c417f855c2b2d1581b77058eed87c84b/scripts/install/install.sh',
                    sha256: '150e3cf675682efeaac115aa3747add3f27887896d04ce6d0b56478d8b428bf6',
                },
                windows: {
                    url: 'https://raw.githubusercontent.com/openai/codex/b412ff32c417f855c2b2d1581b77058eed87c84b/scripts/install/install.ps1',
                    sha256: '3522b77d4485eac014e70fa946787c95fad3874a4e9047557c1e044eb268d13e',
                },
            },
        });
        expect(manifest.providers.opencode.installation).toEqual({
            unixScript: 'https://opencode.ai/install',
            windowsReleaseApi: 'https://api.github.com/repos/anomalyco/opencode/releases/latest',
        });
        expect(manifest.providers.cursor.installation).toEqual({
            unixScript: 'https://cursor.com/install',
            windowsScript: 'https://cursor.com/install?win32=true',
        });
        for (const entry of Object.values(manifest.providers)) {
            expect(entry.installation).not.toHaveProperty('package');
            expect(entry.installation).not.toHaveProperty('version');
        }
    });

    it('accepts a bounded first-line runtime identity and rejects log control characters', () => {
        expect(readAgentRuntimeVersion('codex', 'codex-cli 0.154.0\n')).toBe('codex-cli 0.154.0');
        expect(readAgentRuntimeVersion('cursor', 'future-release\n')).toBe('future-release');
        expect(() => readAgentRuntimeVersion('codex', '  \n')).toThrow('empty version output');
        for (const output of ['codex-cli 9.0\rforged entry', 'codex-cli 9.0\u001b[31m', 'x'.repeat(129)]) {
            expect(() => readAgentRuntimeVersion('codex', output)).toThrow('invalid version identity');
        }
    });
});
