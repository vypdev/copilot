import { delimiter, join } from 'node:path';
import { trustedWindowsSystemRoot } from './windows_system_root.cjs';

export function trustedSystemPath(): string {
    if (process.platform !== 'win32') return ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
    return windowsSystemPath(trustedWindowsSystemRoot());
}

export function windowsSystemPath(systemRoot: string): string {
    return [join(systemRoot, 'System32'), systemRoot,
        join(systemRoot, 'System32', 'Wbem'),
        join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0')].join(delimiter);
}

export function trustedCurlPath(): string {
    return process.platform === 'win32'
        ? trustedWindowsSystemTool('curl.exe') : '/usr/bin/curl';
}

export function trustedWindowsSystemTool(name: string): string {
    return windowsSystemTool(trustedWindowsSystemRoot(), name);
}

export function windowsSystemTool(systemRoot: string, name: string): string {
    return join(systemRoot, 'System32', name);
}

export function trustedUnixShellPath(name: 'sh' | 'bash'): string {
    return `/bin/${name}`;
}
