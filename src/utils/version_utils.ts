/**
 * Compatibility entrypoint for consumers outside the model layer.
 * Version arithmetic remains a pure domain policy in `data/model`.
 */
export {
    DEFAULT_BASE_VERSION,
    DEFAULT_INITIAL_TAG,
    incrementVersion,
    getLatestVersion,
} from '../data/model/version_policy';
