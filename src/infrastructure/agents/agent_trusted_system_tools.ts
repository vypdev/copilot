import { delimiter, join } from 'node:path';

const WINDOWS_SYSTEM_ROOT = 'C:\\Windows';

export function trustedSystemPath(): string {
    if (process.platform !== 'win32') return ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
    return [join(WINDOWS_SYSTEM_ROOT, 'System32'), WINDOWS_SYSTEM_ROOT,
        join(WINDOWS_SYSTEM_ROOT, 'System32', 'Wbem'),
        join(WINDOWS_SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0')].join(delimiter);
}

export function trustedCurlPath(): string {
    return process.platform === 'win32'
        ? join(WINDOWS_SYSTEM_ROOT, 'System32', 'curl.exe') : '/usr/bin/curl';
}

export function trustedUnixShellPath(name: 'sh' | 'bash'): string {
    return `/bin/${name}`;
}
