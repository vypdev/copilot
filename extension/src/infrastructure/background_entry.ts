import { browserApi } from '../adapters/browser/api.ts';
import { startBackground } from './background_runtime.ts';

const api = browserApi();
if (api) startBackground(api);
