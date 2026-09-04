import { spawn } from 'node:child_process';
import type { CliUpgradePort } from '../../application/ports/cli_upgrade_ports';
import { COPILOT_PACKAGE_NAME } from './copilot_package';

export function resolvePnpmExecutable(platform: NodeJS.Platform = process.platform): string {
    return platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

/** Executes the pnpm installation without invoking a shell or interpolating user input. */
export class PnpmCliUpgradeAdapter implements CliUpgradePort {
    upgrade(): Promise<void> {
        const executable = resolvePnpmExecutable();
        const args = ['add', '--global', `${COPILOT_PACKAGE_NAME}@latest`];

        return new Promise((resolve, reject) => {
            const child = spawn(executable, args, {
                shell: false,
                stdio: 'inherit',
            });
            let settled = false;
            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                reject(error);
            };

            child.once('error', (error) => {
                fail(new Error(`Unable to start pnpm upgrade: ${error.message}`));
            });
            child.once('close', (code, signal) => {
                if (settled) return;
                settled = true;
                if (code === 0) {
                    resolve();
                    return;
                }
                const status = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
                reject(new Error(`pnpm upgrade failed with ${status}.`));
            });
        });
    }
}
