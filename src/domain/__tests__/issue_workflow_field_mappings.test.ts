import { classifyIssueWorkflow, parseIssueWorkflowProfile, serializeIssueWorkflowProfile, createIssueWorkflowProfile, ISSUE_WORKFLOW_CATALOG, ISSUE_WORKFLOW_KINDS } from '../issue_workflow_profile';
const body = (heading = 'VaultStadio Version') => `### Description\nFailure\n### Reproducing the issue\nSteps\n### ${heading}\n1.2.3`;
const raw = (fieldMappings: unknown = { bugfix: { 'copilot Version': 'VaultStadio Version' } }) => JSON.stringify({ schemaVersion: 2, enabled: ['bugfix'], fieldMappings });
function mappedProfile() {
    const parsed = parseIssueWorkflowProfile(raw());
    if ('error' in parsed)
        throw new Error(parsed.error);
    return parsed.profile;
}
describe('configured Issue Form headings (#725)', () => {
    it('admits the populated consumer version heading without an upstream compatibility field', () => {
        expect(classifyIssueWorkflow(['bug', 'bugfix'], mappedProfile(), {}, body())).toEqual({ status: 'eligible', kind: 'bugfix' });
    });
    it('still blocks the exact configured field when only the old upstream heading is present', () => {
        expect(classifyIssueWorkflow(['bugfix'], mappedProfile(), {}, body('copilot Version')))
            .toEqual({ status: 'invalid', kind: 'bugfix', missingHeadings: ['VaultStadio Version'] });
    });
    it('round-trips a canonical explicit schema-two mapping', () => {
        expect(JSON.parse(serializeIssueWorkflowProfile(mappedProfile()))).toEqual(JSON.parse(raw()));
    });
});
it('keeps schema-one canonical admission unchanged when no mapping is declared', () => {
    expect(classifyIssueWorkflow(['bugfix'], undefined, {}, body())).toMatchObject({ status: 'invalid', missingHeadings: ['copilot Version'] });
    expect(JSON.parse(serializeIssueWorkflowProfile(mappedProfile())).schemaVersion).toBe(2);
});
it('preserves an informational compatibility field without substituting it for the mapped field', () => {
    expect(classifyIssueWorkflow(['bugfix'], mappedProfile(), {}, body() + '\n### copilot Version\nintegration-v3')).toEqual({ status: 'eligible', kind: 'bugfix' });
});
it('reports mapped duplicate labels case-insensitively', () => {
    expect(classifyIssueWorkflow(['bugfix'], mappedProfile(), {}, body() + '\n### vaultstadio version\nother')).toMatchObject({ status: 'invalid', invalidFields: ['VaultStadio Version (duplicate)'] });
});
it('rejects an empty or missing-response mapped value', () => {
    for (const value of ['', '_No response_'])
        expect(classifyIssueWorkflow(['bugfix'], mappedProfile(), {}, body().replace('1.2.3', value))).toMatchObject({ status: 'invalid', invalidFields: ['VaultStadio Version'] });
});
it('keeps disabled kinds and conflicting labels blocked before considering mapped fields', () => {
    expect(classifyIssueWorkflow(['feature'], mappedProfile(), {}, body())).toEqual({ status: 'disabled', kind: 'feature' });
    expect(classifyIssueWorkflow(['bugfix', 'feature'], mappedProfile(), {}, body())).toMatchObject({ status: 'conflict' });
});
it('rejects two configured roles that share a case-insensitive heading', () => {
    expect(parseIssueWorkflowProfile(raw({ bugfix: { Description: 'Same', 'copilot Version': 'same' } }))).toHaveProperty('error');
});
it('rejects a mapping that collides with an unmapped canonical heading', () => {
    expect(parseIssueWorkflowProfile(raw({ bugfix: { 'copilot Version': 'description' } }))).toHaveProperty('error');
});
it('rejects unknown canonical fields and unselected or unknown kinds', () => {
    for (const mappings of [{ bugfix: { Unknown: 'Version' } }, { feature: { 'Expected impact': 'Impact' } }, { unknown: { Description: 'Description' } }])
        expect(parseIssueWorkflowProfile(raw(mappings))).toHaveProperty('error');
});
it('rejects invalid map/target shapes without coercing them', () => {
    for (const mappings of [null, [], { bugfix: [] }, { bugfix: null }, { bugfix: { 'copilot Version': 1 } }, { bugfix: { 'copilot Version': null } }])
        expect(parseIssueWorkflowProfile(raw(mappings))).toHaveProperty('error');
});
it('rejects empty, padded, multiline and control-bearing target labels', () => {
    for (const label of ['', ' Version', 'Version ', 'Version\nnext', 'Version\u0000', 'Version\u2028next', 'Version\u2029next'])
        expect(parseIssueWorkflowProfile(raw({ bugfix: { 'copilot Version': label } }))).toHaveProperty('error');
});
it('enforces UTF-8 bytes for mapped labels including supplementary characters', () => {
    expect(parseIssueWorkflowProfile(raw({ bugfix: { 'copilot Version': '😀'.repeat(32) } }))).toHaveProperty('profile');
    expect(parseIssueWorkflowProfile(raw({ bugfix: { 'copilot Version': '😀'.repeat(32) + 'x' } }))).toHaveProperty('error');
});
it('requires version-two opt-in and a nonempty mapping', () => {
    expect(parseIssueWorkflowProfile(JSON.stringify({ schemaVersion: 1, enabled: ['bugfix'], fieldMappings: { bugfix: { 'copilot Version': 'Version' } } }))).toHaveProperty('error');
    for (const fieldMappings of [{}, { bugfix: {} }])
        expect(parseIssueWorkflowProfile(raw(fieldMappings))).toHaveProperty('error');
    expect(parseIssueWorkflowProfile('{"schemaVersion":3,"enabled":["bugfix"]}')).toHaveProperty('error');
});
it('rejects duplicate decoded JSON keys including escaped equivalents', () => {
    expect(parseIssueWorkflowProfile('{"schemaVersion":2,"enabled":["bugfix"],"fieldMappings":{"bugfix":{"copilot Version":"One","copilot\\u0020Version":"Two"}}}')).toHaveProperty('error');
});

it('keeps absent native issue bodies invalid instead of inferring field values',()=>expect(classifyIssueWorkflow(['bugfix'],mappedProfile())).toMatchObject({status:'invalid',missingHeadings:['Description','Reproducing the issue','VaultStadio Version']}));
it('isolates and freezes the mapping snapshot from caller edits',()=>{const fields={'copilot Version':'VaultStadio Version'};const selected=['bugfix' as const];const profile=createIssueWorkflowProfile(selected,{bugfix:fields});fields['copilot Version']='Changed';selected.length=0;expect(profile.fieldMappings?.bugfix?.['copilot Version']).toBe('VaultStadio Version');expect(profile.enabled).toEqual(['bugfix']);expect(Object.isFrozen(profile.fieldMappings?.bugfix)).toBe(true);});
it('enforces the combined 4096-byte runtime budget even with individually valid escaped headings',()=>{const fieldMappings=Object.fromEntries(ISSUE_WORKFLOW_KINDS.map(kind=>[kind,Object.fromEntries(ISSUE_WORKFLOW_CATALOG[kind].requiredHeadings.map((heading,index)=>[heading,'\\'.repeat(127)+index]))]));expect(parseIssueWorkflowProfile(JSON.stringify({schemaVersion:2,enabled:ISSUE_WORKFLOW_KINDS,fieldMappings}))).toMatchObject({error:expect.stringContaining('4096')});});

it('rejects class instances as mappings while accepting plain null-prototype dictionaries',()=>{expect(()=>createIssueWorkflowProfile(['bugfix'],new Date('2026-10-27') as never)).toThrow('object');expect(()=>createIssueWorkflowProfile(['bugfix'],{bugfix:new Date('2026-10-27')} as never)).toThrow('object');expect(createIssueWorkflowProfile(['bugfix'],structuredClone({bugfix:{'copilot Version':'VaultStadio Version'}})).fieldMappings?.bugfix?.['copilot Version']).toBe('VaultStadio Version');const fields=Object.assign(Object.create(null),{'copilot Version':'VaultStadio Version'});const mappings=Object.assign(Object.create(null),{bugfix:fields});expect(createIssueWorkflowProfile(['bugfix'],mappings).fieldMappings?.bugfix?.['copilot Version']).toBe('VaultStadio Version');});
