import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSafariContainer } from './safari_container.mts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export async function safariCenterEntrypoint(argv: readonly string[], build = () => buildSafariContainer(ROOT, undefined, 'h3')): Promise<void> {
    if (!argv[1] || path.resolve(argv[1]) !== fileURLToPath(import.meta.url)) return;
    try {
        if (argv.length !== 2) throw new Error('Usage: build:safari:center (no overrides)');
        const app = await build();
        console.log(`Local Safari H3 container: ${app}. Browser enablement, loaded-browser and human acceptance remain separate.`);
    } catch {
        console.error('Safari H3 preparation failed. Inspect .tmp/safari-h3/attempt.json and build.log; the H2 rollback is separate. No browser acceptance is claimed.');
        process.exitCode = 1;
    }
}
await safariCenterEntrypoint(process.argv);
