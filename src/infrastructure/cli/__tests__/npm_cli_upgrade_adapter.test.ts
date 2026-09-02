import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import {
    COPILOT_PACKAGE_NAME,
    NpmCliUpgradeAdapter,
    resolveNpmExecutable,
} from '../npm_cli_upgrade_adapter';

jest.mock('node:child_process', () => ({
    spawn: jest.fn(),
}));

describe('NpmCliUpgradeAdapter', () => {
    const spawnMock = spawn as jest.MockedFunction<typeof spawn>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('resolves the platform-specific npm executable', () => {
        expect(resolveNpmExecutable('darwin')).toBe('npm');
        expect(resolveNpmExecutable('linux')).toBe('npm');
        expect(resolveNpmExecutable('win32')).toBe('npm.cmd');
    });

    it('installs the latest scoped package globally without a shell', async () => {
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child as ReturnType<typeof spawn>);

        const upgrade = new NpmCliUpgradeAdapter().upgrade();

        expect(spawnMock).toHaveBeenCalledWith(
            resolveNpmExecutable(),
            ['install', '--global', `${COPILOT_PACKAGE_NAME}@latest`],
            { shell: false, stdio: 'inherit' },
        );
        child.emit('close', 0, null);

        await expect(upgrade).resolves.toBeUndefined();
    });

    it('reports a non-zero npm exit code', async () => {
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child as ReturnType<typeof spawn>);

        const upgrade = new NpmCliUpgradeAdapter().upgrade();
        child.emit('close', 1, null);

        await expect(upgrade).rejects.toThrow('exit code 1');
    });

    it('reports an npm process startup failure', async () => {
        const child = new EventEmitter();
        spawnMock.mockReturnValue(child as ReturnType<typeof spawn>);

        const upgrade = new NpmCliUpgradeAdapter().upgrade();
        child.emit('error', new Error('npm not found'));

        await expect(upgrade).rejects.toThrow('npm not found');
    });
});
