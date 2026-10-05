import { join, win32 } from 'node:path';
import { trustedWindowsSystemTool, windowsSystemPath, windowsSystemTool } from '../agent_trusted_system_tools';
import { resolveWindowsSystemRoot, trustedWindowsSystemRoot } from '../windows_system_root.cjs';

describe('Windows runner system directory', () => {
    it('accepts an OS installed on another drive', () => {
        expect(resolveWindowsSystemRoot({ SystemRoot: 'D:\\Windows', WINDIR: 'd:\\WINDOWS', SystemDrive: 'D:' }))
            .toBe('D:\\Windows');
        expect(windowsSystemTool('D:\\Windows', 'taskkill.exe')).toBe(join('D:\\Windows', 'System32', 'taskkill.exe'));
        expect(windowsSystemTool('D:\\Windows', 'curl.exe')).toBe(join('D:\\Windows', 'System32', 'curl.exe'));
        expect(windowsSystemPath('D:\\Windows')).toContain(join('D:\\Windows', 'System32', 'Wbem'));
    });

    it.each([
        { SystemRoot: 'C:\\Windows', WINDIR: 'D:\\Windows', SystemDrive: 'C:' },
        { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows', SystemDrive: 'D:' },
        { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' },
        { SystemRoot: 'C:\\attacker', WINDIR: 'C:\\attacker', SystemDrive: 'C:' },
        { SystemRoot: '\\\\server\\Windows', WINDIR: '\\\\server\\Windows' },
        { SystemRoot: '..\\Windows', WINDIR: '..\\Windows' },
        { SystemRoot: 'C:\\Windows\\..\\attacker', WINDIR: 'C:\\Windows\\..\\attacker' },
    ])('rejects a malformed or inconsistent machine root: %p', source => {
        expect(() => resolveWindowsSystemRoot(source)).toThrow();
    });

    const windowsIt = process.platform === 'win32' ? it : it.skip;
    windowsIt('uses the captured root after process environment changes', () => {
        const original = {
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            SystemDrive: process.env.SystemDrive,
        };
        const root = trustedWindowsSystemRoot();
        try {
            process.env.SystemRoot = 'C:\\attacker';
            process.env.WINDIR = 'C:\\attacker';
            process.env.SystemDrive = 'C:';
            expect(trustedWindowsSystemRoot()).toBe(root);
            expect(trustedWindowsSystemTool('taskkill.exe')).toBe(join(root, 'System32', 'taskkill.exe'));
            expect(win32.isAbsolute(trustedWindowsSystemTool('taskkill.exe'))).toBe(true);
        } finally {
            for (const [key, value] of Object.entries(original)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        }
    });
});
