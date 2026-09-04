import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import {
    PnpmCliUpgradeAdapter,
    resolvePnpmExecutable,
} from '../pnpm_cli_upgrade_adapter';
import { COPILOT_PACKAGE_NAME } from '../copilot_package';

jest.mock('node:child_process', () => ({
    spawn: jest.fn(),
}));

describe('PnpmCliUpgradeAdapter', () => {
    const spawnMock = spawn as jest.MockedFunction<typeof spawn>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('resolves the platform-specific pnpm executable', () => {
        expect(resolvePnpmExecutable('darwin')).toBe('pnpm');
        expect(resolvePnpmExecutable('linux')).toBe('pnpm');
        expect(resolvePnpmExecutable('win32')).toBe('pnpm.cmd');
    });

    it('installs the latest scoped package globally without a shell', async () => {
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child as ReturnType<typeof spawn>);

        const upgrade = new PnpmCliUpgradeAdapter().upgrade();

        expect(spawnMock).toHaveBeenCalledWith(
            resolvePnpmExecutable(),
            ['add', '--global', `${COPILOT_PACKAGE_NAME}@latest`],
            { shell: false, stdio: 'inherit' },
        );
        child.emit('close', 0, null);

        await expect(upgrade).resolves.toBeUndefined();
    });

    it('reports a non-zero pnpm exit code', async () => {
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child as ReturnType<typeof spawn>);

        const upgrade = new PnpmCliUpgradeAdapter().upgrade();
        child.emit('close', 1, null);

        await expect(upgrade).rejects.toThrow('exit code 1');
    });

    it('reports a pnpm process startup failure', async () => {
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child as ReturnType<typeof spawn>);

        const upgrade = new PnpmCliUpgradeAdapter().upgrade();
        child.emit('error', new Error('pnpm not found'));

        await expect(upgrade).rejects.toThrow('pnpm not found');
    });
});
