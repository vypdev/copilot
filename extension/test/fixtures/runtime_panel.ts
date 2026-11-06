import { runtimeCopy } from '../../src/presentation/runtime_copy.ts';
import { runtimeProvenanceView } from '../../src/presentation/runtime_provenance_view.ts';
import { runtimeConfiguration } from '../../src/domain/runtime_configuration.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { CONFIG, clearNativeRestriction } from './page_configuration.ts';
import { CONNECTED } from './runtime.ts';

export function runtimePanelCopy(locale = 'en') {
    const configuration = runtimeConfiguration({ ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } } }, CONFIG, CONNECTED, 0, clearNativeRestriction());
    if (!configuration) throw new Error('invalid-connected-panel-fixture');
    return { ...runtimeCopy(locale), readable: true, checking: false, explanation: runtimeProvenanceView(configuration, locale) };
}
