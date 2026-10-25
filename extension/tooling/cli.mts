import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDevelopmentSet } from './build.mts';
import { validateDevelopmentBuild } from './validation.mts';

const ENTRY = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(ENTRY), '../..');

export async function main(args: readonly string[], root = ROOT, report = console.log): Promise<void> {
    if (process.versions.node.split('.')[0] !== '24') throw new Error('Node 24 is required; switch runtime and retry.');
    if (args.length !== 1 || !['build', 'validate'].includes(args[0])) throw new Error('Usage: pnpm --dir extension run build|validate (no output or target overrides).');
    const output = path.join(root, 'extension/dist');
    if (args[0] === 'build') {
        const receipt = await buildDevelopmentSet(root, output);
        report(`Complete development set: ${output}\n${JSON.stringify(receipt, null, 2)}\nBrowser loading and product acceptance remain unverified.`);
    } else {
        await validateDevelopmentBuild(root, output);
        report('PASS: architecture, package/CI contract, complete artifacts and two clean reproducible builds. Browser loading remains unverified.');
    }
}

export async function runEntrypoint(argv: readonly string[], run = main): Promise<void> {
    if (!argv[1] || path.resolve(argv[1]) !== ENTRY) return;
    try { await run(argv.slice(2)); }
    catch (error) {
        console.error(error instanceof Error ? error.message : 'Extension check failed; inspect phase and retry.');
        process.exitCode = 1;
    }
}

await runEntrypoint(process.argv);
