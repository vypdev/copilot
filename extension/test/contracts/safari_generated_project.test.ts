import { expect, it } from 'vitest';
import { normalizeSafariProject, MAX_SAFARI_PROJECT_BYTES } from '../../tooling/safari_generated_project.mts';
import { safariContainerProfile } from '../../tooling/safari_profile.mts';

const project = () => ({ targets: [
    { name: 'CopilotH3', 'product-type': 'application', 'build-settings': { PRODUCT_BUNDLE_IDENTIFIER: 'invalid.extensions.copilot.CopilotH3', MARKETING_VERSION: '1.0', SWIFT_VERSION: '5.0' } },
    { name: 'CopilotH3 Extension', 'product-type': 'app-extension', 'build-settings': { PRODUCT_BUNDLE_IDENTIFIER: 'invalid.extensions.copilot.h3.Extension', MARKETING_VERSION: '1.0', ENABLE_APP_SANDBOX: 'YES' } },
], metadata: { preserve: ['resource', '$(inherited)'] } });
const legacy = 'invalid.extensions.copilot.CopilotH3 MARKETING_VERSION = 1.0; KEEP = unchanged;';
it('modern Safari project normalization changes only known target identifiers/version and preserves unrelated generated settings', () => {
    const original = project(); const result = JSON.parse(normalizeSafariProject('jsonc', JSON.stringify(original), 'h3'));
    expect(result.targets.map((target: { 'build-settings': object }) => target['build-settings'])).toEqual([
        { PRODUCT_BUNDLE_IDENTIFIER: 'invalid.extensions.copilot.h3', MARKETING_VERSION: '0.1.0', SWIFT_VERSION: '5.0' },
        { PRODUCT_BUNDLE_IDENTIFIER: 'invalid.extensions.copilot.h3.Extension', MARKETING_VERSION: '0.1.0', ENABLE_APP_SANDBOX: 'YES' },
    ]); expect(result.metadata).toEqual(original.metadata);
});
it('modern Safari project accepts native converter comments/trailing commas and normalizes them without executing text', () => {
    const source = JSON.stringify(project()).replace('"targets":[', '"targets":[/* generated */').replace('"1.0",', '"1.0",\n');
    const commented = source.replace('"$(inherited)"]', '"$(inherited)",]');
    expect(JSON.parse(normalizeSafariProject('jsonc', commented, 'h3')).metadata.preserve).toEqual(['resource', '$(inherited)']);
});
it('modern Safari normalization is idempotent for an already verified local project', () => {
    const once = normalizeSafariProject('jsonc', JSON.stringify(project()), 'h3'); expect(normalizeSafariProject('jsonc', once, 'h3')).toBe(once);
});
it('H2 profile retains its original fixed namespace while supporting the modern project format', () => {
    const source = JSON.stringify(project()).replaceAll('CopilotH3', 'CopilotH2').replaceAll('copilot.h3', 'copilot.h2');
    expect(JSON.parse(normalizeSafariProject('jsonc', source)).targets[0]['build-settings'].PRODUCT_BUNDLE_IDENTIFIER).toBe('invalid.extensions.copilot.h2');
});
it('legacy Safari project normalizes the generated namespace/version while preserving unrelated text', () => {
    const result = normalizeSafariProject('pbx', legacy, 'h3'); expect(result).toBe('invalid.extensions.copilot.h3 MARKETING_VERSION = 0.1.0; KEEP = unchanged;');
    expect(normalizeSafariProject('pbx', result, 'h3')).toBe(result);
});
it('legacy H2 normalization preserves the default caller contract', () => {
    expect(normalizeSafariProject('pbx', legacy.replaceAll('H3', 'H2'))).toContain('invalid.extensions.copilot.h2');
});
it('legacy unknown namespace or unsupported version cannot be silently rewritten', () => {
    expect(() => normalizeSafariProject('pbx', legacy.replace('invalid.extensions.copilot.CopilotH3', 'other.app'), 'h3')).toThrow('identity-or-version');
    expect(() => normalizeSafariProject('pbx', legacy.replace('1.0;', '9.0;'), 'h3')).toThrow('identity-or-version');
});
it('project-size policy measures UTF-8 bytes and admits the exact bound without accepting the next multibyte character', () => {
    const remaining = MAX_SAFARI_PROJECT_BYTES - Buffer.byteLength(legacy); const source = legacy + 'é'.repeat(Math.floor(remaining / 2)) + ' '.repeat(remaining % 2);
    expect(() => normalizeSafariProject('pbx', source, 'h3')).not.toThrow(); expect(() => normalizeSafariProject('pbx', source + 'é', 'h3')).toThrow('project-size');
});
it('nontext source and unknown project layouts fail closed before normalization', () => {
    expect(() => normalizeSafariProject('jsonc', null, 'h3')).toThrow('project-size');
    expect(() => normalizeSafariProject('future' as never, legacy, 'h3')).toThrow('project-format');
});
it.each(['{', 'null', '[]', '{"targets":[]}', '{"targets":[{}, {}, {}]}'])('modern Safari rejects malformed or incompatible root %s', source => {
    expect(() => normalizeSafariProject('jsonc', source, 'h3')).toThrow('project-json');
});
it.each([
    ['null target', (value: ReturnType<typeof project>) => { value.targets[1] = null as never; }],
    ['missing name', (value: ReturnType<typeof project>) => { delete (value.targets[1] as { name?: string }).name; }],
    ['duplicate target', (value: ReturnType<typeof project>) => { value.targets[1] = structuredClone(value.targets[0]); }],
    ['unknown target', (value: ReturnType<typeof project>) => { value.targets[1].name = 'Third-party app'; }],
    ['wrong product type', (value: ReturnType<typeof project>) => { value.targets[0]['product-type'] = 'app-extension'; }],
    ['missing settings', (value: ReturnType<typeof project>) => { value.targets[0]['build-settings'] = null as never; }],
])('modern Safari rejects %s without returning a partially normalized project', (_name, change) => {
    const value = project(); change(value); expect(() => normalizeSafariProject('jsonc', JSON.stringify(value), 'h3')).toThrow('project-target');
});
it('modern Safari rejects an unrelated application identity rather than taking over that target', () => {
    const value = project(); value.targets[0]['build-settings'].PRODUCT_BUNDLE_IDENTIFIER = 'other.app';
    expect(() => normalizeSafariProject('jsonc', JSON.stringify(value), 'h3')).toThrow('identity-or-version');
});
it('modern Safari rejects an unrelated extension identity without weakening the containing-app match', () => {
    const value = project(); value.targets[1]['build-settings'].PRODUCT_BUNDLE_IDENTIFIER = 'other.extension';
    expect(() => normalizeSafariProject('jsonc', JSON.stringify(value), 'h3')).toThrow('identity-or-version');
});
it('modern Safari rejects an unsupported marketing version before native compilation', () => {
    const value = project(); value.targets[0]['build-settings'].MARKETING_VERSION = '9.0';
    expect(() => normalizeSafariProject('jsonc', JSON.stringify(value), 'h3')).toThrow('identity-or-version');
});
it('container profiles are immutable and bounded; no caller can introduce arbitrary app/output names', () => {
    expect(Object.isFrozen(safariContainerProfile('h3'))).toBe(true); expect(safariContainerProfile().appName).toBe('CopilotH2');
    for (const value of ['custom', '../h2', null, {}, 1]) expect(() => safariContainerProfile(value)).toThrow('container-profile');
});
