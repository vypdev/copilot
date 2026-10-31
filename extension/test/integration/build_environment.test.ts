import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TARGETS } from '../../src/domain/target.ts';
import { readTarget, validateArtifactSet } from '../../tooling/artifact_validation.mts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = new URL('../../tooling/build.mts', import.meta.url).href;
let temporary: string;
async function build(name: string, nodeEnvironment: string | undefined): Promise<string> {
    const output = path.join(temporary, name); const environment = { ...process.env };
    if (nodeEnvironment === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = nodeEnvironment;
    // A real fresh process gives Vite its actual startup environment without mutating the test worker.
    execFileSync(process.execPath, ['--input-type=module', '-e',
        `const {buildDevelopmentSet}=await import(${JSON.stringify(entry)});
        await buildDevelopmentSet(${JSON.stringify(root)},${JSON.stringify(output)});`], {
        cwd: path.join(root, 'extension'), env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 65536,
    });
    await validateArtifactSet(output); return output;
}
async function identical(first: string, second: string): Promise<void> {
    expect(await readFile(path.join(first, 'receipt.json'), 'utf8')).toBe(await readFile(path.join(second, 'receipt.json'), 'utf8'));
    for (const target of TARGETS) expect(await readTarget(path.join(first, target))).toEqual(await readTarget(path.join(second, target)));
}
let production: string;
beforeAll(async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'copilot-production-environment-')); production = await build('production', 'production');
}, 60000);
afterAll(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });

it('a test runner environment produces the same complete production runtime and receipt as the standalone builder', async () => {
    await identical(production, await build('test', 'test'));
});
it('development and unset caller environments preserve the same complete production artifacts without changing the caller', async () => {
    const before = process.env.NODE_ENV;
    await identical(production, await build('development', 'development'));
    await identical(production, await build('unset', undefined)); expect(process.env.NODE_ENV).toBe(before);
});
it('the pinned production runtime excludes the actual development-only HMR hooks exposed by the regression', async () => {
    for (const target of TARGETS) {
        const files = await readTarget(path.join(production, target));
        const javascript = [...files].filter(([name]) => name.endsWith('.js')).map(([, source]) => source).join('\n');
        expect(javascript).not.toContain('Symbol("hmr anchor")');
        expect(javascript).not.toContain('Symbol("proxy path")');
    }
});
