import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

it('the public native page and center CLI load through unmodified Node24 strip-only mode without starting a browser', () => {
    const page = new URL('../../tooling/webdriver_page.mts', import.meta.url).href;
    const cli = new URL('../../tooling/center_browser_cli.mts', import.meta.url).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
        `const p=await import(${JSON.stringify(page)}); const c=await import(${JSON.stringify(cli)});
        if(typeof p.NativePage!=='function'||typeof c.centerBrowserMain!=='function')process.exit(1);
        process.stdout.write('node24-direct-entry-ok');`], {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)), encoding: 'utf8', timeout: 20000, maxBuffer: 16384,
    });
    expect(output).toBe('node24-direct-entry-ok');
});
