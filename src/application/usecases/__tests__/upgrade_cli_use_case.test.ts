import { UpgradeCliUseCase } from '../upgrade_cli_use_case';

describe('UpgradeCliUseCase', () => {
    it('delegates the upgrade to the semantic port', async () => {
        const result = { version: '3.7.0', packageManager: 'npm' as const, executablePath: '/npm/bin/copilot' };
        const upgrade = jest.fn().mockResolvedValue(result);

        await expect(new UpgradeCliUseCase({ upgrade }).execute()).resolves.toEqual(result);

        expect(upgrade).toHaveBeenCalledTimes(1);
    });

    it('propagates port failures to the CLI boundary', async () => {
        const failure = new Error('npm failed');
        const upgrade = jest.fn().mockRejectedValue(failure);

        await expect(new UpgradeCliUseCase({ upgrade }).execute()).rejects.toBe(failure);
    });
});
