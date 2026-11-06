import { buildSourceIdentity } from './build_identity.ts';
import { browserApi } from '../adapters/browser/api.ts';
import { startCenter } from './center_app.ts';
import '../presentation/center.css';

const api = browserApi();
if (api) {
    globalThis.document.documentElement.dataset.copilotSourceTree = buildSourceIdentity();
    startCenter(api, globalThis.document, globalThis.navigator.language);
}
