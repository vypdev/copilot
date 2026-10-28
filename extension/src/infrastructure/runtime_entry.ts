import { buildSourceIdentity } from './build_identity.ts';
import { browserApi } from '../adapters/browser/api.ts';
import { startOptions } from './options_runtime.ts';

const api = browserApi();
if (api) {
    globalThis.document.documentElement.dataset.copilotSourceTree = buildSourceIdentity();
    startOptions(api, globalThis.document, globalThis.navigator.language);
}
