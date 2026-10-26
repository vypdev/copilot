import { isEligibleGitHubUrl } from '../domain/eligibility.ts';
import { browserApi } from '../adapters/browser/api.ts';
import { startContent } from './content_runtime.ts';

// Protected direct loads exit before API lookup, observers, messages or storage reads.
if (isEligibleGitHubUrl(globalThis.location.href)) {
    const api = browserApi();
    if (api) startContent(api, globalThis.window, globalThis.document);
}
