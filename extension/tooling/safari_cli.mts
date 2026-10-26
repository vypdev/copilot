import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSafariContainer } from './safari_container.mts';

export async function safariEntrypoint(argv: readonly string[], build = buildSafariContainer): Promise<void> {
    if (!argv[1] || path.resolve(argv[1]) !== fileURLToPath(import.meta.url)) return;
    try {
        if (argv.length !== 2) throw new Error('Usage: build:safari (no overrides)');
        const app = await build(fileURLToPath(new URL('../../', import.meta.url)));
        console.log(`Local Safari container: ${app}. Enable this development extension in Safari; browser acceptance is a separate command.`);
    } catch { console.error('Safari container build failed. Inspect local prerequisites and .tmp/safari-h2/build.log; no browser acceptance is claimed.'); process.exitCode = 1; }
}
await safariEntrypoint(process.argv);
