import { createUpgradeCliUseCase } from '../cli_upgrade_composition_root';
import { ActiveCliUpgradeAdapter } from '../../cli/active_cli_upgrade_adapter';

describe('CLI upgrade composition', () => {
    it('wires the default active-installation adapter and preserves its verification evidence', async () => {
        const result = { version: '3.8.0', packageManager: 'npm' as const, executablePath: '/npm/bin/copilot' };
        const upgrade = jest.spyOn(ActiveCliUpgradeAdapter.prototype, 'upgrade').mockResolvedValue(result);
        try {
            await expect(createUpgradeCliUseCase().execute()).resolves.toEqual(result);
            expect(upgrade).toHaveBeenCalledTimes(1);
        } finally {
            upgrade.mockRestore();
        }
    });

    it('uses an injected upgrade port without starting a global installer', async () => {
        const failure = new Error('verification failed');
        const upgrade = jest.fn().mockRejectedValue(failure);
        await expect(createUpgradeCliUseCase({ upgrade }).execute()).rejects.toBe(failure);
        expect(upgrade).toHaveBeenCalledTimes(1);
    });
});
