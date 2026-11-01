import { CONFIGURATION_SCHEMA_VERSION, CONFIGURATION_START, CONFIGURATION_END, readConfigurationBlock, writeConfigurationBlock } from '../configuration_markers';
import * as legacy from '../../manager/description/configuration_markers';
import { CONFIG_SCHEMA_VERSION } from '../../data/model/config';

it('treats an absent optional issue description as absent durable state', () => {
    expect(readConfigurationBlock(undefined)).toEqual({ kind: 'absent' });
});
it('preserves existing manager imports and the durable model version without a second implementation', () => {
    expect(legacy.CONFIGURATION_START).toBe(CONFIGURATION_START); expect(legacy.CONFIGURATION_END).toBe(CONFIGURATION_END);
    expect(legacy.readConfigurationBlock).toBe(readConfigurationBlock); expect(legacy.writeConfigurationBlock).toBe(writeConfigurationBlock);
    expect(CONFIG_SCHEMA_VERSION).toBe(3); expect(CONFIG_SCHEMA_VERSION).toBe(CONFIGURATION_SCHEMA_VERSION);
});
it('rejects nested complete state behind a legacy fence instead of choosing a hidden inner record', () => {
    const body = ['```json', CONFIGURATION_START, CONFIGURATION_START, '{}', CONFIGURATION_END, '```'].join('\n');
    expect(readConfigurationBlock(body)).toEqual({ kind: 'invalid' });
    expect(writeConfigurationBlock(body, '{"schemaVersion":3}')).toBeUndefined();
});
it('rejects two complete legacy-fenced state records instead of replacing either record', () => {
    const block = [CONFIGURATION_START, '{}', CONFIGURATION_END].join('\n');
    const body = ['```json', block, block, '```'].join('\n');
    expect(readConfigurationBlock(body)).toEqual({ kind: 'invalid' });
    expect(writeConfigurationBlock(body, '{"schemaVersion":3}')).toBeUndefined();
});
