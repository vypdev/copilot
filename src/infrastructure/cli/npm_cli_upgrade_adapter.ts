import { spawn } from 'node:child_process';
import type { CliUpgradePort } from '../../application/ports/cli_upgrade_ports';

export const COPILOT_PACKAGE_NAME = '@vypdev/copilot';

export function resolveNpmExecutable(platform: NodeJS.Platform = process.platform): string {
    return platform === 'win32' ? 'npm.cmd' : 'npm';
}

/** Executes the npm installation without invoking a shell or interpolating user input. */
export class NpmCliUpgradeAdapter implements CliUpgradePort {
    upgrade(): Promise<void> {
        const executable = resolveNpmExecutable();
        const args = ['install', '--global', `${COPILOT_PACKAGE_NAME}@latest`];

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
                fail(new Error(`Unable to start npm upgrade: ${error.message}`));
            });
            child.once('close', (code, signal) => {
                if (settled) return;
                settled = true;
                if (code === 0) {
                    resolve();
                    return;
                }
                const status = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
                reject(new Error(`npm upgrade failed with ${status}.`));
            });
        });
    }
}
