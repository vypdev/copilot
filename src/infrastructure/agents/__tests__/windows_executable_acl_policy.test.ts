import { assertWindowsExecutableDacl, assertWindowsExecutableParentDacl } from '../windows_executable_acl_policy';

const user = 'S-1-5-21-100-200-300-1001';
const check = (sddl: string) => assertWindowsExecutableDacl(sddl, user, false);

describe('installed Windows executable ACL policy', () => {
    it('allows trusted owner writes and shared read/execute grants', () => {
        expect(() => check(`O:${user}G:SYD:AI(A;;FA;;;${user})(A;ID;FRFX;;;BU)`)).not.toThrow();
        expect(() => check('O:BAD:AI(A;;FA;;;BA)(A;ID;0x1200a9;;;BU)')).not.toThrow();
        expect(() => check(`O:${user}D:AI(A;;0xa0000000;;;BU)`)).not.toThrow();
    });

    it.each([
        `O:${user}D:AI(A;;FA;;;BU)`,
        `O:${user}D:AI(A;ID;FW;;;WD)`,
        `O:${user}D:AI(A;;0x001301bf;;;AU)`,
        `O:${user}D:AI(A;;0x40000000;;;AU)`,
        `O:${user}D:AI(A;;0x10000000;;;AU)`,
        `O:${user}D:AI(A;;WD;;;AU)`,
        `O:${user}D:AI(A;;SD;;;AU)`,
    ])('rejects an untrusted mutation grant in %s', sddl => {
        expect(() => check(sddl)).toThrow('writable by another principal');
    });

    it('ignores inherit-only and deny entries that do not grant writes on this file', () => {
        expect(() => check(`O:${user}D:AI(A;;FA;;;${user})(A;OICIIO;FA;;;WD)(D;;FA;;;WD)`)).not.toThrow();
    });

    it.each([
        `O:S-1-5-21-9-9-9-1001D:AI(A;;FR;;;BU)`,
        `O:${user}D:AI(A;;UNKNOWN;;;BU)`,
        'D:AI(A;;FR;;;BU)',
        `O:${user}D:AI(A;;0x100000000;;;BU)`,
        `O:${user}D:AI(X;;FR;;;BU)`,
        `O:${user}D:AI(A;;FR;;;BU)garbage`,
        `O:${user}D:AI`,
    ])('fails closed for unknown or untrusted ACL evidence in %s', sddl => {
        expect(() => check(sddl)).toThrow();
    });
});

describe('installed Windows executable parent ACL policy', () => {
    const checkParent = (sddl: string) => assertWindowsExecutableParentDacl(sddl, user, false);

    it('allows shared reads and add-only directory rights without replacement authority', () => {
        expect(() => checkParent(`O:${user}D:AI(A;;FA;;;${user})(A;;0x1200a9;;;BU)`)).not.toThrow();
        expect(() => checkParent('O:BAD:AI(A;;FA;;;BA)(A;;0x00000006;;;BU)')).not.toThrow();
    });

    it.each([
        `O:${user}D:AI(A;;DC;;;BU)`,
        `O:${user}D:AI(A;;0x00000040;;;AU)`,
        `O:${user}D:AI(A;;SD;;;AU)`,
        `O:${user}D:AI(A;;WD;;;AU)`,
        `O:${user}D:AI(A;;WO;;;AU)`,
        `O:${user}D:AI(A;;GA;;;AU)`,
        'O:S-1-5-21-9-9-9-1001D:AI(A;;FR;;;BU)',
    ])('rejects a replaceable ancestor %s', sddl => {
        expect(() => checkParent(sddl)).toThrow();
    });
});
