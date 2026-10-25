export function inwardGraph(): Map<string, string> {
    return new Map(Object.entries({
        'src/domain/browser_extension_contract/index.ts': "export { manifest } from './manifest';",
        'src/domain/browser_extension_contract/manifest.ts': 'export const manifest = 1;',
        'extension/src/domain/a.ts': "import { manifest } from '../../../src/domain/browser_extension_contract/index'; export const a = manifest;",
        'extension/src/application/a.ts': "import { a } from '../domain/a'; export { a };",
        'extension/src/adapters/browser/a.ts': "export { a } from '../../application/a';",
        'extension/src/presentation/a.ts': "import { a } from '../domain/a'; export const view = a;",
        'extension/src/infrastructure/a.ts': "export { a } from '../application/a';",
    }));
}
