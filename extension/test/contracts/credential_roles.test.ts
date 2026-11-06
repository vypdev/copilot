import { expect, it } from 'vitest';
import { sessionPurpose, writePurpose, optionalRoleCredential, validWriteSelections, writeSelectionsView, validWriteSelectionsView, EMPTY_WRITE_SELECTIONS } from '../../src/domain/credential_roles.ts';
import { purposeVault } from '../fixtures/credential_roles.ts';

it.each(['repository-read', 'issues-write', 'actions-write'])('the closed %s purpose is recognized without granting provider authority', value => {
    expect(sessionPurpose(value)).toBe(true); expect(writePurpose(value)).toBe(value !== 'repository-read');
});
it.each(['ghp_synthetic_classic', 'ghs_synthetic_installation', 'gho_synthetic_oauth', 'sk_synthetic_provider', 'github_pat_', 'github_pat_bad suffix', 'github_pat_' + 'x'.repeat(245), null])('an unsupported optional-role credential %j is rejected before provider access', value => {
    expect(optionalRoleCredential(value)).toBe(false);
});
it('optional purpose input accepts the documented fine-grained family within the existing bound, without assuming a fixed token length', () => {
    expect(optionalRoleCredential('github_pat_x')).toBe(true); expect(optionalRoleCredential('github_pat_' + 'x'.repeat(244))).toBe(true);
});
it.each(['setup', 'bot', 'provider', 'write', 'deploy', 'secrets', 'https://other.test', '', null, 7])('the unsupported purpose %j cannot become a role', value => {
    expect(sessionPurpose(value)).toBe(false); expect(writePurpose(value)).toBe(false);
});
it('optional roles default independently disabled and expose no credential or permission certificate', () => {
    const slots = writeSelectionsView(EMPTY_WRITE_SELECTIONS, ['issues-write', 'actions-write']);
    expect(slots).toEqual({ 'issues-write': { state: 'disabled', selected: null }, 'actions-write': { state: 'disabled', selected: null } });
    expect(Object.isFrozen(EMPTY_WRITE_SELECTIONS)).toBe(true); expect(Object.isFrozen(slots['issues-write'])).toBe(true);
    expect(validWriteSelections(EMPTY_WRITE_SELECTIONS, [])).toBe(true); expect(validWriteSelectionsView(slots, [])).toBe(true);
});
it('a retained optional selection is stored until explicit worker identity verification and cannot select the other purpose', () => {
    const vault = purposeVault(); const selected = { 'issues-write': 'issues', 'actions-write': 'actions' };
    const view = writeSelectionsView(selected, ['actions-write']);
    expect(view).toEqual({ 'issues-write': { state: 'stored', selected: 'issues' }, 'actions-write': { state: 'identity-verified', selected: 'actions' } });
    expect(validWriteSelections(selected, vault.entries)).toBe(true); expect(validWriteSelectionsView(view, vault.entries)).toBe(true);
    expect(JSON.stringify(view)).not.toContain('secret'); expect(JSON.stringify(view)).not.toContain('grant');
});
it.each([
    ['missing role', { 'issues-write': null }], ['unknown role', { ...EMPTY_WRITE_SELECTIONS, setup: null }],
    ['missing entry', { ...EMPTY_WRITE_SELECTIONS, 'issues-write': 'missing' }], ['read entry', { ...EMPTY_WRITE_SELECTIONS, 'issues-write': 'read' }],
    ['wrong optional purpose', { ...EMPTY_WRITE_SELECTIONS, 'issues-write': 'actions' }], ['non-identifier', { ...EMPTY_WRITE_SELECTIONS, 'issues-write': 'Bad' }],
    ['non-record', []], ['null', null],
])('a %s native selection cannot acquire a purpose slot', (_name, value) => {
    expect(validWriteSelections(value, purposeVault().entries)).toBe(false);
});
it.each([
    ['absent slots', null], ['missing purpose', { 'issues-write': { state: 'disabled', selected: null } }],
    ['extra purpose', { ...writeSelectionsView(EMPTY_WRITE_SELECTIONS), setup: {} }],
    ['missing state', { selected: null }], ['private credential', { state: 'disabled', selected: null, secret: 'private' }],
    ['disabled selected entry', { state: 'disabled', selected: 'issues' }], ['unknown identity state', { state: 'authorized', selected: 'issues' }],
    ['verified null', { state: 'identity-verified', selected: null }], ['verified missing entry', { state: 'identity-verified', selected: 'missing' }],
    ['verified wrong purpose', { state: 'identity-verified', selected: 'actions' }], ['stored read entry', { state: 'stored', selected: 'read' }],
    ['non-record slot', null],
])('a %s public role view cannot certify selection or identity verification', (name, value) => {
    const reply = ['absent slots', 'missing purpose', 'extra purpose'].includes(name as string) ? value
        : { ...writeSelectionsView(EMPTY_WRITE_SELECTIONS), 'issues-write': value };
    expect(validWriteSelectionsView(reply, purposeVault().entries)).toBe(false);
});
